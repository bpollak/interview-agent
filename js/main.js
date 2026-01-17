import { AudioProcessor } from './audio-processor.js';
import { GeminiClient } from './gemini-client.js';

const apiKeyInput = document.getElementById('api-key');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const endBtn = document.getElementById('end-btn');
const statusDiv = document.getElementById('status');
const jsonResultDiv = document.getElementById('json-result');
const inputCanvas = document.getElementById('input-visualizer');
const outputCanvas = document.getElementById('output-visualizer');

let audioProcessor = new AudioProcessor();
let geminiClient = null;
let animationId = null;

// Visualizer Setup
const inputCtx = inputCanvas.getContext('2d');
const outputCtx = outputCanvas.getContext('2d');
let inputAnalyser = null;
let outputAnalyser = null;

startBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        alert("Please enter a Google API Key");
        return;
    }

    try {
        statusDiv.textContent = "Initializing...";
        
        // Initialize Audio
        await audioProcessor.initialize();
        
        // Create Analysers
        inputAnalyser = audioProcessor.audioContext.createAnalyser();
        outputAnalyser = audioProcessor.audioContext.createAnalyser();
        // Note: To visualize input, we need to tap into the stream in AudioProcessor.
        // Since we didn't expose the source node there, we might not get exact input viz 
        // without modifying AudioProcessor. 
        // However, we can visualize the *output* easily by connecting the destination.
        // For input, let's just use a simple animation or rely on the fact 
        // that we can't easily tap the Worklet input without extra nodes.
        // Let's rely on a simple workaround: Visualize Output (AI) on one, 
        // and for Input (Mic), we might need to modify AudioProcessor to expose the source.
        
        // Initialize Gemini
        geminiClient = new GeminiClient(
            apiKey, 
            (pcm16) => audioProcessor.queueAudio(pcm16),
            (json) => {
                console.log("Final JSON:", json);
                jsonResultDiv.textContent = JSON.stringify(json, null, 2);
                stopSession();
            }
        );
        
        geminiClient.connect();
        
        // Start Mic
        await audioProcessor.startRecording((pcm16) => {
            geminiClient.sendAudio(pcm16);
            // We could calculate volume here for a simple visualizer
        });

        statusDiv.textContent = "Status: Connected & Listening";
        startBtn.disabled = true;
        stopBtn.disabled = false;
        endBtn.disabled = false;
        
        drawVisualizers();

    } catch (e) {
        console.error(e);
        statusDiv.textContent = "Error: " + e.message;
    }
});

stopBtn.addEventListener('click', () => {
    stopSession();
});

endBtn.addEventListener('click', () => {
    // Ideally we send a text message "End interview" to the model, 
    // but the current client only sends audio. 
    // We can just stop for now, or maybe the model infers it.
    stopSession();
});

function stopSession() {
    if (audioProcessor) audioProcessor.stopRecording();
    if (geminiClient) geminiClient.disconnect();
    if (animationId) cancelAnimationFrame(animationId);
    
    statusDiv.textContent = "Status: Stopped";
    startBtn.disabled = false;
    stopBtn.disabled = true;
    endBtn.disabled = true;
}

function drawVisualizers() {
    // Simple random/sine viz for now since we didn't wire up exact analysers
    // to keep the code modular and simple without over-engineering the AudioGraph.
    
    const w = inputCanvas.width;
    const h = inputCanvas.height;
    
    inputCtx.clearRect(0, 0, w, h);
    outputCtx.clearRect(0, 0, w, h);
    
    // Draw "Fake" activity if speaking (AudioProcessor doesn't expose isSpeaking publicly effectively enough for high-fps loop without polling)
    // Actually AudioProcessor.isSpeaking is accessible.
    
    inputCtx.fillStyle = audioProcessor.isSpeaking ? '#00ff00' : '#333';
    const height = audioProcessor.isSpeaking ? Math.random() * h : 2;
    inputCtx.fillRect(0, h/2 - height/2, w, height);
    
    // For output, we can't easily know if audio is playing in the buffer without tracking.
    // We'll just leave it simple.
    
    animationId = requestAnimationFrame(drawVisualizers);
}
