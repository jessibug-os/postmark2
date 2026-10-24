import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from character_pipeline import build
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
build("rowan", os.path.abspath(argv[0] if argv else "."))
