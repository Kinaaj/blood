import sys

# --- UNIFORM LOGGING HELPERS ---
def log_info(msg: str):
    print(f"ℹ️  [INFO] {msg}")

def log_success(msg: str):
    print(f"✅ [SUCCESS] {msg}")

def log_warn(msg: str):
    print(f"⚠️  [WARN] {msg}")

def log_error(msg: str):
    print(f"❌ [ERROR] {msg}", file=sys.stderr)
