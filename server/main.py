import shutil
import os
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from .video import process_video_stabilized

app = FastAPI()

UPLOAD_DIR = "uploads"
PROCESSED_DIR = "processed"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

@app.get("/")
def read_root():
    return {"message": "Hello from Mozzaic Server"}

@app.post("/process/video")
async def process_video_endpoint(file: UploadFile = File(...), k: int = 8, width: int = 320):
    # Save upload
    input_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Define output
    output_filename = f"pixel_{file.filename}"
    output_path = os.path.join(PROCESSED_DIR, output_filename)
    
    # Process (Blocking for now, but simple)
    # Ideally use BackgroundTasks or Celery for long videos
    process_video_stabilized(input_path, output_path, target_width=width, k=k)
    
    return FileResponse(output_path, media_type="video/mp4", filename=output_filename)
