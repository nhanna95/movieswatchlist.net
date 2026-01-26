from pathlib import Path

def get_project_root() -> Path:
    """
    Get the project root directory (one level up from backend directory).
    This is the directory containing backend/, frontend/, tracked-lists/, etc.
    """
    return Path(__file__).parent.parent
