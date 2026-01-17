import asyncio
import json
import os
import pyaudio
import sys
from dotenv import load_dotenv
from google import genai

# Audio Configuration
FORMAT = pyaudio.paInt16
CHANNELS = 1
SAMPLE_RATE = 16000  # Gemini uses 16kHz or 24kHz. 16kHz is safe for input.
CHUNK_SIZE = 512

load_dotenv()

class AudioLoop:
    def __init__(self):
        self.p = pyaudio.PyAudio()
        self.input_stream = None
        self.output_stream = None

    def start_input(self):
        self.input_stream = self.p.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=SAMPLE_RATE,
            input=True,
            frames_per_buffer=CHUNK_SIZE
        )

    def start_output(self):
        self.output_stream = self.p.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=24000, # Gemini typically outputs 24kHz
            output=True,
        )

    async def read_input(self):
        while True:
            if self.input_stream and self.input_stream.is_active():
                try:
                    data = await asyncio.to_thread(self.input_stream.read, CHUNK_SIZE, exception_on_overflow=False)
                    yield data
                except Exception as e:
                    print(f"Mic Error: {e}")
                    break
            else:
                await asyncio.sleep(0.01)

    async def play_audio(self, data):
        if self.output_stream:
            await asyncio.to_thread(self.output_stream.write, data)

    def close(self):
        if self.input_stream:
            self.input_stream.stop_stream()
            self.input_stream.close()
        if self.output_stream:
            self.output_stream.stop_stream()
            self.output_stream.close()
        self.p.terminate()

def load_config():
    try:
        with open("session_config.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print("Error: session_config.json not found. Run setup_interview.py first.")
        sys.exit(1)

async def main():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GOOGLE_API_KEY environment variable not set.")
        return

    config = load_config()
    print(f"--- Starting Interview: {config['process_name']} ---")
    print("Press Ctrl+C to end the session.")

    client = genai.Client(http_options={"api_version": "v1alpha"})
    
    # Construct System Instruction
    sys_instruct = f"""
    You are 'OpsInsight', an autonomous business process interviewer.
    
    CONTEXT:
    Target Process: {config['process_name']}
    Objective: {config['objective']}
    Your Persona: {config['persona_tone']}

    INSTRUCTIONS:
    1. Introduce yourself briefly and state the objective.
    2. Interview the user to map their workflow step-by-step.
    3. Use "Recursive Probing": If the user says "I do X", ask "How? Using what tool? Who receives it?".
    4. Focus on identifying bottlenecks, manual handoffs, and waste.
    5. Be concise in your spoken responses. Do not lecture.

    IMPORTANT:
    At the very end, if the user says "End Interview" or "I'm done", 
    you must output a single valid JSON object summarizing the process and inefficiencies, 
    then say "Thank you, session saved."
    """

    audio = AudioLoop()
    audio.start_input()
    audio.start_output()

    config_live = {"response_modalities": ["AUDIO"]}

    try:
        async with client.aio.live.connect(
            model="gemini-2.0-flash-exp",
            config=config_live,
            system_instruction=sys_instruct
        ) as session:
            
            # Task to send audio from mic to Gemini
            async def send_audio():
                async for chunk in audio.read_input():
                    await session.send(input=chunk, end_of_turn=False)

            # Task to receive audio from Gemini to speaker
            async def receive_audio():
                while True:
                    async for response in session.receive():
                        server_content = response.server_content
                        if server_content is not None:
                            model_turn = server_content.model_turn
                            if model_turn is not None:
                                for part in model_turn.parts:
                                    if part.inline_data is not None:
                                        # Audio data
                                        await audio.play_audio(part.inline_data.data)
                                    if part.text is not None:
                                        # Print text for debugging/logging
                                        print(f"Agent: {part.text}")
            
            # Run both
            send_task = asyncio.create_task(send_audio())
            receive_task = asyncio.create_task(receive_audio())
            
            # Wait until interrupted
            await asyncio.gather(send_task, receive_task)

    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"Session Error: {e}")
    finally:
        audio.close()
        print("\nSession Ended.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
