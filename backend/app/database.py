import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)
os.makedirs(os.path.join(STORAGE_DIR, "projects"), exist_ok=True)
os.makedirs(os.path.join(STORAGE_DIR, "uploads"), exist_ok=True)
os.makedirs(os.path.join(STORAGE_DIR, "renders"), exist_ok=True)
os.makedirs(os.path.join(STORAGE_DIR, "temp"), exist_ok=True)

DB_PATH = os.path.join(STORAGE_DIR, "autovideo.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
