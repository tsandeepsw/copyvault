use std::collections::HashMap;
use std::time::{Duration, Instant};

const SUPPRESSION_TTL: Duration = Duration::from_secs(30);

/// Tracks self-originated clipboard writes to eliminate infinite recapture loops.
#[derive(Debug, Default)]
pub struct ClipboardEchoTracker {
    /// Change counts produced directly by CopyVault writes mapped to insertion time.
    suppressed_change_counts: HashMap<i64, Instant>,
    /// SHA-256 hashes of payloads written by CopyVault mapped to insertion time.
    suppressed_hashes: HashMap<String, Instant>,
    /// Most recent processed change count from the OS.
    last_processed_change_count: i64,
}

impl ClipboardEchoTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Prunes expired suppression entries older than SUPPRESSION_TTL.
    fn prune(&mut self) {
        let now = Instant::now();
        self.suppressed_change_counts
            .retain(|_, time| now.duration_since(*time) < SUPPRESSION_TTL);
        self.suppressed_hashes
            .retain(|_, time| now.duration_since(*time) < SUPPRESSION_TTL);
    }

    /// Records that CopyVault has written to the clipboard with the resulting change count and hash.
    pub fn record_internal_write(&mut self, change_count: i64, content_hash: &str) {
        let now = Instant::now();
        self.suppressed_change_counts.insert(change_count, now);
        self.suppressed_hashes.insert(content_hash.to_string(), now);
        self.last_processed_change_count = change_count;
        self.prune();
    }

    /// Checks if a hash is currently suppressed as an internal write.
    pub fn is_hash_suppressed(&self, content_hash: &str) -> bool {
        if let Some(&time) = self.suppressed_hashes.get(content_hash) {
            return Instant::now().duration_since(time) < SUPPRESSION_TTL;
        }
        false
    }

    /// Determines if a detected clipboard event was produced by CopyVault itself.
    pub fn is_self_echo(&mut self, change_count: i64, content_hashes: &[&str]) -> bool {
        self.prune();

        // 1. If the change count was explicitly recorded during our own write, ignore it.
        if self.suppressed_change_counts.contains_key(&change_count) {
            self.last_processed_change_count = change_count;
            return true;
        }

        // 2. If any hash matches an internally written payload within the suppression TTL, ignore it.
        for &hash in content_hashes {
            if self.is_hash_suppressed(hash) {
                self.last_processed_change_count = change_count;
                return true;
            }
        }

        // 3. If the change count is identical to what we already processed, ignore it.
        if change_count == self.last_processed_change_count {
            return true;
        }

        self.last_processed_change_count = change_count;
        false
    }

    /// Single-hash convenience wrapper for testing.
    pub fn is_self_echo_single(&mut self, change_count: i64, content_hash: &str) -> bool {
        self.is_self_echo(change_count, &[content_hash])
    }

    /// Resets tracking.
    pub fn reset(&mut self) {
        self.suppressed_change_counts.clear();
        self.suppressed_hashes.clear();
        self.last_processed_change_count = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_echo_tracking_prevents_loop() {
        let mut tracker = ClipboardEchoTracker::new();

        // 1. External copy: change_count = 10, hash = "abc"
        assert!(!tracker.is_self_echo_single(10, "abc"));

        // 2. Unchanged poll: change_count = 10, hash = "abc" -> ignored as unchanged
        assert!(tracker.is_self_echo_single(10, "abc"));

        // 3. CopyVault writes: change_count = 11, hash = "def"
        tracker.record_internal_write(11, "def");

        // 4. Next listener poll sees change_count = 11, hash = "def" -> detected as self-echo!
        assert!(tracker.is_self_echo_single(11, "def"));

        // 5. Subsequent poll with same internal write at change_count = 11 -> still suppressed!
        assert!(tracker.is_self_echo_single(11, "def"));

        // 6. External copy of a different payload at change_count = 12 -> captured!
        assert!(!tracker.is_self_echo_single(12, "xyz"));
    }
}

