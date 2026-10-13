import datetime
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, default="Untitled Project")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    settings_json = Column(Text, default="{}")
    script = Column(Text, nullable=True)

    assets = relationship("Asset", back_populates="project", cascade="all, delete-orphan")
    sentences = relationship("Sentence", back_populates="project", cascade="all, delete-orphan")
    timeline = relationship("Timeline", back_populates="project", uselist=False, cascade="all, delete-orphan")
    render_jobs = relationship("RenderJob", back_populates="project", cascade="all, delete-orphan")

class Asset(Base):
    __tablename__ = "assets"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    type = Column(String, nullable=False)  # "image" | "audio"
    original_name = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    duration = Column(Float, nullable=True)  # duration in seconds (for audio)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    order_index = Column(Integer, default=0)
    metadata_json = Column(Text, default="{}")

    project = relationship("Project", back_populates="assets")

class Sentence(Base):
    __tablename__ = "sentences"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    order_index = Column(Integer, default=0)
    text = Column(Text, nullable=False)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    confidence = Column(Float, default=1.0)

    project = relationship("Project", back_populates="sentences")

class Timeline(Base):
    __tablename__ = "timelines"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"), unique=True, nullable=False, index=True)
    timeline_json = Column(Text, nullable=False, default="{}")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="timeline")

class RenderJob(Base):
    __tablename__ = "render_jobs"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    status = Column(String, default="pending")  # pending, rendering, completed, failed, cancelled
    progress = Column(Float, default=0.0)
    output_path = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="render_jobs")
