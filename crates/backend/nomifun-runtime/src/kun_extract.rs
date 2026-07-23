//! Atomic extraction of the embedded Kun runtime archive.

use std::fs::{self, File};
use std::io::{BufReader, Write};
use std::path::{Component, Path, PathBuf};

use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const STAMP_FILE: &str = "hangcore-kun-runtime.stamp";
const ENTRYPOINT: &str = "kun/dist/cli/serve-entry.js";

#[derive(Debug, Serialize, Deserialize)]
struct Stamp {
    sha256: String,
    extracted_at: String,
}

#[derive(Debug, thiserror::Error)]
pub enum KunExtractError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("serde_json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("archive checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },
    #[error("unsafe or unsupported archive entry: {0}")]
    UnsafeEntry(String),
    #[error("Kun runtime entrypoint is missing after extraction")]
    MissingEntrypoint,
}

pub fn is_fresh(dir: &Path, expected_sha: &str) -> bool {
    if !dir.join(ENTRYPOINT).is_file() {
        return false;
    }
    let Ok(bytes) = fs::read(dir.join(STAMP_FILE)) else {
        return false;
    };
    let Ok(stamp): Result<Stamp, _> = serde_json::from_slice(&bytes) else {
        return false;
    };
    stamp.sha256 == expected_sha
}

pub fn extract_into(
    dir: &Path,
    blob: &[u8],
    expected_sha: &str,
) -> Result<PathBuf, KunExtractError> {
    let root = dir.parent().unwrap_or(dir);
    fs::create_dir_all(root)?;
    let lock_file = File::create(root.join("kun-runtime.lock"))?;
    lock_file.lock_exclusive()?;

    if is_fresh(dir, expected_sha) {
        let _ = FileExt::unlock(&lock_file);
        return Ok(dir.to_path_buf());
    }

    let result = (|| -> Result<PathBuf, KunExtractError> {
        let actual_sha = sha256_bytes(blob);
        if actual_sha != expected_sha {
            return Err(KunExtractError::ChecksumMismatch {
                expected: expected_sha.to_owned(),
                actual: actual_sha,
            });
        }

        let cache_name = dir
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("kun-runtime");
        let staging = root.join(format!(".{cache_name}.installing"));
        let _ = fs::remove_dir_all(&staging);
        fs::create_dir_all(&staging)?;

        let unpack_result = unpack_archive(&staging, blob);
        if let Err(error) = unpack_result {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
        if !staging.join(ENTRYPOINT).is_file() {
            let _ = fs::remove_dir_all(&staging);
            return Err(KunExtractError::MissingEntrypoint);
        }

        let stamp = Stamp {
            sha256: expected_sha.to_owned(),
            extracted_at: epoch_timestamp(),
        };
        let stamp_tmp = staging.join(format!("{STAMP_FILE}.tmp"));
        {
            let mut file = File::create(&stamp_tmp)?;
            file.write_all(&serde_json::to_vec_pretty(&stamp)?)?;
            file.sync_all()?;
        }
        fs::rename(stamp_tmp, staging.join(STAMP_FILE))?;

        if dir.exists() {
            fs::remove_dir_all(dir)?;
        }
        fs::rename(&staging, dir)?;
        Ok(dir.to_path_buf())
    })();

    let _ = FileExt::unlock(&lock_file);
    result
}

fn unpack_archive(staging: &Path, blob: &[u8]) -> Result<(), KunExtractError> {
    let reader = BufReader::new(std::io::Cursor::new(blob));
    let decoder = zstd::stream::read::Decoder::new(reader)?;
    let mut archive = tar::Archive::new(decoder);
    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.into_owned();
        if path.is_absolute()
            || path.components().any(|component| {
                matches!(
                    component,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(KunExtractError::UnsafeEntry(path.display().to_string()));
        }
        let kind = entry.header().entry_type();
        if !kind.is_file() && !kind.is_dir() {
            return Err(KunExtractError::UnsafeEntry(path.display().to_string()));
        }
        if !entry.unpack_in(staging)? {
            return Err(KunExtractError::UnsafeEntry(path.display().to_string()));
        }
    }
    Ok(())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn epoch_timestamp() -> String {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("epoch-{seconds}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_runtime_blob(include_entrypoint: bool) -> (Vec<u8>, String) {
        let mut tar_bytes = Vec::new();
        {
            let mut archive = tar::Builder::new(&mut tar_bytes);
            let mut package = tar::Header::new_gnu();
            let package_body = b"{\"name\":\"kun\"}";
            package.set_path("kun/package.json").unwrap();
            package.set_size(package_body.len() as u64);
            package.set_mode(0o644);
            package.set_cksum();
            archive.append(&package, &package_body[..]).unwrap();
            if include_entrypoint {
                let mut entry = tar::Header::new_gnu();
                let body = b"process.exit(0);";
                entry.set_path(ENTRYPOINT).unwrap();
                entry.set_size(body.len() as u64);
                entry.set_mode(0o644);
                entry.set_cksum();
                archive.append(&entry, &body[..]).unwrap();
            }
            archive.finish().unwrap();
        }
        let mut blob = Vec::new();
        let mut encoder = zstd::stream::write::Encoder::new(&mut blob, 0).unwrap();
        encoder.write_all(&tar_bytes).unwrap();
        encoder.finish().unwrap();
        let sha = sha256_bytes(&blob);
        (blob, sha)
    }

    #[test]
    fn extracts_runtime_atomically_and_reuses_fresh_cache() {
        let (blob, sha) = make_runtime_blob(true);
        let temp = tempfile::TempDir::new().unwrap();
        let dir = temp.path().join("kun-test");

        let resolved = extract_into(&dir, &blob, &sha).unwrap();
        assert_eq!(resolved, dir);
        assert!(is_fresh(&dir, &sha));

        let resolved_again = extract_into(&dir, &blob, &sha).unwrap();
        assert_eq!(resolved_again, dir);
        assert!(is_fresh(&dir, &sha));
    }

    #[test]
    fn rejects_corrupt_archive_checksum() {
        let (blob, _) = make_runtime_blob(true);
        let temp = tempfile::TempDir::new().unwrap();
        let dir = temp.path().join("kun-test");

        let error = extract_into(&dir, &blob, "0000").unwrap_err();
        assert!(matches!(error, KunExtractError::ChecksumMismatch { .. }));
        assert!(!dir.exists());
    }

    #[test]
    fn rejects_archive_without_runtime_entrypoint() {
        let (blob, sha) = make_runtime_blob(false);
        let temp = tempfile::TempDir::new().unwrap();
        let dir = temp.path().join("kun-test");

        let error = extract_into(&dir, &blob, &sha).unwrap_err();
        assert!(matches!(error, KunExtractError::MissingEntrypoint));
        assert!(!dir.exists());
    }
}
