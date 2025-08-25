document.addEventListener('DOMContentLoaded', () => {
    console.log("🎯 Voice Agent script loaded");

    const recordButton = document.getElementById('record-btn');
    const statusText = document.getElementById('status-text');
    const messagesDiv = document.getElementById('messages');
    const audioPlayer = document.getElementById('audio-player');

    let recorder;
    let audioChunks = [];
    let isRecording = false;
    let isPlaying = false;

    // Session ID
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id') || `session-${Math.random().toString(36).substr(2, 9)}`;
    window.history.pushState({}, '', `?session_id=${sessionId}`);

    // Chat Message UI
    function addMessage(text, isUser = false) {
        const bubble = document.createElement('div');
        bubble.classList.add(isUser ? 'user-message' : 'agent-message');
        bubble.textContent = isUser ? `You: ${text}` : `Agent: ${text}`;
        messagesDiv.appendChild(bubble);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function setStatus(text, canRecord = true) {
        statusText.textContent = text;
        // Keep button enabled during recording to allow stopping
        recordButton.disabled = isPlaying && !isRecording;
    }

    // Audio Playback
    function playAudio(audioUrl) {
        if (!audioUrl) {
            setStatus("⚠️ No audio received", true);
            return;
        }
        audioPlayer.src = audioUrl;
        audioPlayer.play();
        isPlaying = true;
        setStatus("🔊 Agent is speaking...");
        audioPlayer.onended = () => {
            isPlaying = false;
            setStatus("🎤 Hold the mic to speak", true);
            startRecording();
        };
        audioPlayer.onerror = () => {
            isPlaying = false;
            setStatus("⚠️ Error playing audio", true);
        };
    }

    // Recording Logic
    function startRecording() {
        if (isRecording || isPlaying) {
            console.log("⚠️ Cannot start recording: already recording or playing");
            return;
        }
        isRecording = true;
        audioChunks = [];
        setStatus("🎙️ Listening...", false);
        recordButton.classList.add("recording");

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                recorder.ondataavailable = e => {
                    if (e.data && e.data.size > 0) {
                        audioChunks.push(e.data);
                        console.log("📝 Added audio chunk, total:", audioChunks.length);
                    }
                };
                recorder.onstop = () => {
                    console.log("📦 Stopped & processing audio chunks:", audioChunks.length, "chunks");
                    stream.getTracks().forEach(track => track.stop());
                    isRecording = false;
                    recordButton.classList.remove("recording");
                    if (audioChunks.length > 0) {
                        processAudio(new Blob(audioChunks, { type: 'audio/webm' }));
                    } else {
                        setStatus("⚠️ No audio recorded", true);
                    }
                };
                recorder.start(100); // 100ms timeslice
                console.log("✅ Recording started, state:", recorder.state);
            })
            .catch(err => {
                console.error("❌ Mic access error:", err);
                setStatus("❌ Mic permission denied", true);
                isRecording = false;
                recordButton.classList.remove("recording");
            });
    }

    function stopRecording() {
        console.log("🛑 Attempting to stop recording...", { recorder, state: recorder?.state });
        if (recorder) {
            try {
                recorder.stop();
                setStatus("⏳ Processing...", false);
                console.log("🛑 Recording stopped successfully, state:", recorder.state);
            } catch (e) {
                console.error("❌ Error stopping recorder:", e);
                recorder.stream.getTracks().forEach(track => track.stop());
                isRecording = false;
                recordButton.classList.remove("recording");
                setStatus("⚠️ Recording stopped manually due to error", true);
            }
        } else {
            console.warn("⚠️ No recorder object to stop, resetting state");
            isRecording = false;
            recordButton.classList.remove("recording");
            setStatus("⚠️ Recording not initialized, stopped manually", true);
        }
    }

    // Send Audio to /agent/chat/{session_id}
    async function processAudio(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        try {
            const response = await fetch(`/agent/chat/${sessionId}`, {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            console.log("Backend response:", data);
            if (data.user_text) addMessage(data.user_text, true);
            if (data.ai_text) addMessage(data.ai_text, false);
            if (data.audio_url) playAudio(data.audio_url);
        } catch (err) {
            console.error("❌ Processing error:", err);
            setStatus("❌ Error getting AI response", true);
        }
    }

    function clearChat(){
        messagesDiv.innerHTML='';
        console.log("Chat cleared");
        setStatus("Chat cleared,hold the mic to speak",true);
    }

    // Event Listeners
    recordButton.addEventListener("click", () => {
        console.log("🔘 Button clicked, isRecording:", isRecording, "button class:", recordButton.classList);
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
        // Sync button state
        recordButton.classList.toggle("recording", isRecording);
    });

    const clearChatButton=document.getElementById('clear-chat');
    if(clearChatButton){
        clearChatButton.addEventListener('click',clearChat);

    }else{
        console.warn("⚠️ Clear chat button not found, ensure it has id='clear-chat'");
    }

    // Disable touch events for now to avoid conflicts
    // recordButton.addEventListener('touchstart', startRecording);
    // recordButton.addEventListener('touchend', stopRecording);

    // Init
    setStatus("🎤 Hold the mic to speak", true);
    addMessage("Hello! I'm your AI voice agent. Hold the microphone button to speak.", false);
});