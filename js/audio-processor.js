export class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.stream = null;
        this.onAudioData = null; // Callback for sending data to WebSocket
        this.isPlaying = false;
        
        // VAD Parameters
        this.isSpeaking = false;
        this.silenceStart = null;
        this.vadThreshold = 0.01; // Energy threshold
        this.vadSilenceTimeout = 500; // ms of silence before stopping
        
        // Output Buffer
        this.nextStartTime = 0;
    }

    async initialize() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 48000, // Try to force 48k, or let system decide
            latencyHint: 'interactive'
        });
        
        await this.audioContext.audioWorklet.addModule('js/worklets/pcm-processor.js');
    }

    async startRecording(onAudioData) {
        this.onAudioData = onAudioData;
        
        // Resume context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    channelCount: 1, 
                    echoCancellation: true,
                    autoGainControl: true,
                    noiseSuppression: true
                } 
            });

            const source = this.audioContext.createMediaStreamSource(this.stream);
            this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
            
            this.workletNode.port.onmessage = (event) => {
                // event.data is Int16Array buffer
                const pcm16 = new Int16Array(event.data);
                this.handleInputAudio(pcm16);
            };

            source.connect(this.workletNode);
            // We don't connect worklet to destination to avoid feedback
            
            console.log("Recording started");
        } catch (err) {
            console.error("Error accessing microphone:", err);
            throw err;
        }
    }

    stopRecording() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
    }

    handleInputAudio(pcm16) {
        // Calculate Energy for VAD
        let sumSquares = 0;
        for (let i = 0; i < pcm16.length; i++) {
            // Normalize to 0-1 range for energy calc
            const val = pcm16[i] / 32768;
            sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / pcm16.length);
        
        // Simple VAD Logic
        if (rms > this.vadThreshold) {
            this.isSpeaking = true;
            this.silenceStart = null;
        } else {
            if (this.isSpeaking) {
                if (!this.silenceStart) this.silenceStart = Date.now();
                if (Date.now() - this.silenceStart > this.vadSilenceTimeout) {
                    this.isSpeaking = false;
                    // Could trigger "User stopped speaking" event here if needed
                }
            }
        }

        // Always send audio if we are "speaking" or if we want continuous stream
        // For Gemini Live, we usually just stream. The VAD is to save bandwidth/tokens
        // or to provide visual feedback.
        // The prompt says: "stop streaming audio when the user is silent"
        
        if (this.isSpeaking || (this.silenceStart && Date.now() - this.silenceStart < this.vadSilenceTimeout)) {
             // Convert back to Base64 for transport? 
             // Actually, the client handles the transport format. 
             // We pass the raw buffer.
             if (this.onAudioData) {
                 this.onAudioData(pcm16);
             }
        }
    }

    queueAudio(pcm16Data) {
        // Input is Int16Array (24kHz typically from Gemini)
        // We need to convert to Float32 and play
        
        const float32 = new Float32Array(pcm16Data.length);
        for (let i = 0; i < pcm16Data.length; i++) {
            float32[i] = pcm16Data[i] / 32768;
        }

        const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);

        // Schedule playback
        const now = this.audioContext.currentTime;
        // If nextStartTime is in the past, reset it
        if (this.nextStartTime < now) {
            this.nextStartTime = now;
        }
        
        source.start(this.nextStartTime);
        
        // Update next start time
        this.nextStartTime += buffer.duration;
    }
}
