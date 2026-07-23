//! Compile-time access to the managed Kun runtime archive.

pub(crate) mod consts {
    include!(concat!(env!("OUT_DIR"), "/kun_meta.rs"));
}

pub(crate) fn has_embedded_runtime() -> bool {
    consts::HAS_EMBEDDED_KUN_RUNTIME
}

pub(crate) fn runtime_blob() -> &'static [u8] {
    consts::KUN_RUNTIME_BLOB
}

pub(crate) fn runtime_sha256() -> &'static str {
    consts::KUN_RUNTIME_SHA256
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_embed_respects_build_gate() {
        if has_embedded_runtime() {
            assert!(!runtime_blob().is_empty());
            assert!(!runtime_sha256().is_empty());
        } else {
            assert_eq!(runtime_blob(), b"");
            assert_eq!(runtime_sha256(), "");
        }
    }
}
