//! Resolver for the managed Kun runtime embedded in release builds.

use std::path::PathBuf;
use std::sync::OnceLock;

use crate::cache;
use crate::kun_embed;
use crate::kun_extract::{self, KunExtractError};

static RESOLVED_KUN_RUNTIME: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum KunRuntimeError {
    #[error("runtime cache directory is unavailable")]
    CacheUnavailable,
    #[error("failed to extract embedded Kun runtime: {0}")]
    Extract(#[from] KunExtractError),
}

pub fn has_embedded_runtime() -> bool {
    kun_embed::has_embedded_runtime()
}

pub fn resolve_embedded_runtime() -> Result<Option<PathBuf>, KunRuntimeError> {
    if !kun_embed::has_embedded_runtime() {
        return Ok(None);
    }
    if let Some(path) = RESOLVED_KUN_RUNTIME.get() {
        return Ok(Some(path.clone()));
    }

    let sha = kun_embed::runtime_sha256();
    let dir = cache::kun_dir(sha).ok_or(KunRuntimeError::CacheUnavailable)?;
    let resolved = if kun_extract::is_fresh(&dir, sha) {
        dir
    } else {
        kun_extract::extract_into(&dir, kun_embed::runtime_blob(), sha)?
    };
    let _ = RESOLVED_KUN_RUNTIME.set(resolved.clone());
    Ok(Some(resolved))
}
