use std::collections::HashMap;
use std::process::Child;
use std::sync::Mutex;
use std::sync::atomic::AtomicI32;

pub struct ScanProcess(pub AtomicI32);

pub struct TerminalState {
    pub pids: Mutex<HashMap<String, i32>>,
    pub children: Mutex<HashMap<String, Child>>,
}

impl TerminalState {
    pub fn new() -> Self {
        Self {
            pids: Mutex::new(HashMap::new()),
            children: Mutex::new(HashMap::new()),
        }
    }
}
