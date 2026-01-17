export class GeminiClient {
    constructor(apiKey, onAudioOutput, onJsonOutput) {
        this.apiKey = apiKey;
        this.ws = null;
        this.onAudioOutput = onAudioOutput;
        this.onJsonOutput = onJsonOutput;
        this.isConnected = false;
    }

    connect() {
        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("Connected to Gemini");
            this.isConnected = true;
            this.sendSetup();
        };

        this.ws.onmessage = async (event) => {
            await this.handleMessage(event.data);
        };

        this.ws.onerror = (err) => {
            console.error("WebSocket Error:", err);
        };

        this.ws.onclose = () => {
            console.log("Disconnected from Gemini");
            this.isConnected = false;
        };
    }

    sendSetup() {
        const setupMessage = {
            setup: {
                model: "models/gemini-2.0-flash-exp",
                generation_config: {
                    response_modalities: ["AUDIO"] // We want audio back
                },
                system_instruction: {
                    parts: [{
                        text: `
You are 'OpsInsight', an expert in Enterprise Operations and Value Stream Mapping (VSM). 
Your goal is to interview the user to construct a Value Stream Map of their process.

Persona: Neutral, Analytical, Rigorous. Do not be overly enthusiastic. Be professional.

Methodology (TIM WOODS):
- Focus on Cycle Times, Handoffs, and Waste (Transport, Inventory, Motion, Waiting, Overproduction, Overprocessing, Defects, Skills).
- Use Recursive Probing: If the user is vague (e.g., "it takes a while"), ask for specific quantification (minutes, hours, days).
- Ask about 'Percent Complete and Accurate' (%C&A) at handoffs.

At the VERY END of the interview (when the user indicates they are done or you have sufficient info), output a VALID JSON object summarizing the session. 
Do not output the JSON until the end.
The JSON structure should be:
{
  "process_name": "...",
  "steps": [
    { "name": "...", "cycle_time": "...", "actor": "...", "waste_identified": ["..."] }
  ],
  "overall_efficiency_notes": "..."
}
                        `
                    }]
                }
            }
        };
        this.ws.send(JSON.stringify(setupMessage));
    }

    sendAudio(pcm16Data) {
        if (!this.isConnected) return;

        // Convert Int16Array to Base64 String
        const base64Audio = this.arrayBufferToBase64(pcm16Data.buffer);

        const msg = {
            realtime_input: {
                media_chunks: [{
                    mime_type: "audio/pcm;rate=16000",
                    data: base64Audio
                }]
            }
        };

        this.ws.send(JSON.stringify(msg));
    }

    async handleMessage(data) {
        let msg;
        if (data instanceof Blob) {
            const text = await data.text();
            msg = JSON.parse(text);
        } else {
            msg = JSON.parse(data);
        }

        if (msg.serverContent) {
            const parts = msg.serverContent.modelTurn?.parts;
            if (parts) {
                for (const part of parts) {
                    if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
                        // Decode Base64 audio
                        const pcm16 = this.base64ToInt16Array(part.inlineData.data);
                        this.onAudioOutput(pcm16);
                    }
                    if (part.text) {
                        console.log("Model Text:", part.text);
                        // Check if it looks like the final JSON
                        if (part.text.trim().startsWith("{") && part.text.trim().endsWith("}")) {
                            try {
                                const json = JSON.parse(part.text);
                                if (this.onJsonOutput) this.onJsonOutput(json);
                            } catch (e) {
                                // Not JSON or partial
                            }
                        }
                    }
                }
            }
        }
    }

    // Helper: ArrayBuffer to Base64
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    // Helper: Base64 to Int16Array
    base64ToInt16Array(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new Int16Array(bytes.buffer);
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
