from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
import assemblyai as aai
import google.generativeai as genai
from gtts import gTTS
import os
import uuid
import logging


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


load_dotenv()
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not ASSEMBLYAI_API_KEY:
    raise ValueError("❌ Missing AssemblyAI API key")
if not GEMINI_API_KEY:
    raise ValueError("❌ Missing GEMINI_API_KEY in .env")


aai.settings.api_key = ASSEMBLYAI_API_KEY
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-flash")


app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.post("/agent/chat/{session_id}")
async def process_audio(session_id: str, file: UploadFile = File(...)):
    try:
        
        os.makedirs("temp", exist_ok=True)
        os.makedirs("static", exist_ok=True)

        
        temp_webm = f"temp/temp_{uuid.uuid4()}.webm"
        with open(temp_webm, "wb") as f:
            f.write(await file.read())
        logger.info(f"Created temp file: {temp_webm}")

      
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(temp_webm)

        if transcript.status != "completed":
            raise HTTPException(status_code=500, detail=f"❌ Transcription failed: {transcript.error}")

        user_text = transcript.text.strip()
        if not user_text:
            raise HTTPException(status_code=400, detail="❌ No speech detected in audio")

        logger.info(f"Transcription: {user_text}")

        
        response = model.generate_content(user_text)
        ai_text = response.text.strip()
        logger.info(f"Gemini response: {ai_text}")

        
        tts = gTTS(ai_text)
        audio_filename = f"static/{uuid.uuid4()}.mp3"
        tts.save(audio_filename)
        logger.info(f"Audio saved: {audio_filename}")

        
        os.remove(temp_webm)

        return JSONResponse({
            "session_id": session_id,
            "user_text": user_text,
            "ai_text": ai_text,
            "audio_url": f"/{audio_filename}"
        })

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error in process_audio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing audio: {str(e)}")


@app.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

