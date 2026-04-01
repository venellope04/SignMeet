let client = null;
    let localTracks = { videoTrack: null, audioTrack: null };
    let localVideoElement = null;
    let remoteUsers = {};
    let ws = null;
    let isDetecting = false;
    let uid = null;

    const title = document.getElementById('title');
    const joinSection = document.getElementById('joinSection');
    const roomSection = document.getElementById('roomSection');
    const videoContainer = document.getElementById('video_container');
    const subtitle = document.getElementById('subtitle');
    const leaveBtn = document.getElementById('leaveBtn');
    const camBtn = document.getElementById('camBtn');
    const micBtn = document.getElementById('micBtn');
    const detectBtn = document.getElementById('detectBtn');

    console.log("title:", !!title);
    console.log("joinSection:", !!joinSection);
    console.log("roomSection:", !!roomSection);
    console.log("videoContainer:", !!videoContainer);
    console.log("subtitle:", !!subtitle);
    console.log("leaveBtn:", !!leaveBtn);
    console.log("camBtn:", !!camBtn);
    console.log("micBtn:", !!micBtn);
    console.log("detectBtn:", !!detectBtn);

    // Hide the subtitle initially
    subtitle.style.display = 'none';

    async function fetchToken(roomName) {
        const response = await fetch(`/get_token/?channelName=${encodeURIComponent(roomName)}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    }

    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return ws;
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        ws = new WebSocket(wsProtocol + window.location.host + '/ws/sign_detection/');
        ws.onopen = () => console.log("WebSocket connected for sign detection");
        ws.onmessage = (event) => {
            const translation = event.data;
            subtitle.textContent = `Translation: ${translation}`;
            console.log("Received translation:", translation);
        };
        ws.onclose = () => {
            console.log("WebSocket connection closed");
            ws = null;
        };
        ws.onerror = (error) => console.error("WebSocket error:", error);
        return ws;
    }

    function waitForWebSocketOpen(socketInstance, timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            if (!socketInstance) {
                reject(new Error("WebSocket could not be created."));
                return;
            }

            if (socketInstance.readyState === WebSocket.OPEN) {
                resolve(socketInstance);
                return;
            }

            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error("WebSocket connection timed out."));
            }, timeoutMs);

            const handleOpen = () => {
                cleanup();
                resolve(socketInstance);
            };

            const handleClose = () => {
                cleanup();
                reject(new Error("WebSocket connection closed before opening."));
            };

            const handleError = () => {
                cleanup();
                reject(new Error("WebSocket connection failed."));
            };

            function cleanup() {
                clearTimeout(timeoutId);
                socketInstance.removeEventListener('open', handleOpen);
                socketInstance.removeEventListener('close', handleClose);
                socketInstance.removeEventListener('error', handleError);
            }

            socketInstance.addEventListener('open', handleOpen);
            socketInstance.addEventListener('close', handleClose);
            socketInstance.addEventListener('error', handleError);
        });
    }

    function getDeviceErrorMessage(err, deviceName) {
        if (!err) {
            return `${deviceName} is unavailable right now.`;
        }

        if (err.code === "NOT_READABLE" || err.name === "NotReadableError") {
            return `${deviceName} is already in use by another app or browser tab. Close the other app and try again.`;
        }

        if (err.code === "PERMISSION_DENIED" || err.name === "NotAllowedError") {
            return `${deviceName} permission was blocked. Please allow browser access and try again.`;
        }

        return `${deviceName} error: ${err.message}`;
    }

    function attachLocalVideo(track, userName) {
        let localVideoContainer = document.getElementById(`user-container-${uid}`);

        if (!localVideoContainer) {
            localVideoContainer = document.createElement("div");
            localVideoContainer.className = "user-video-container";
            localVideoContainer.id = `user-container-${uid}`;

            localVideoElement = document.createElement("video");
            localVideoElement.id = `user-video-${uid}`;
            localVideoElement.className = "video-element";
            localVideoElement.muted = true;
            localVideoElement.autoplay = true;

            const nameLabel = document.createElement("div");
            nameLabel.className = "user-name-label";
            nameLabel.textContent = userName;

            localVideoContainer.appendChild(localVideoElement);
            localVideoContainer.appendChild(nameLabel);
            videoContainer.appendChild(localVideoContainer);
        } else {
            localVideoElement = document.getElementById(`user-video-${uid}`);
        }

        const stream = new MediaStream();
        stream.addTrack(track.getMediaStreamTrack());
        localVideoElement.srcObject = stream;
        track._videoElement = localVideoElement;
        return localVideoElement.play();
    }

    async function enableCamera(userName) {
        const videoTrack = await AgoraRTC.createCameraVideoTrack({
            encoderConfig: { width: 229, height: 229, frameRate: 15, bitrateMin: 300, bitrateMax: 500 }
        });
        console.log("Video track created:", videoTrack);

        const videoStreamTrack = videoTrack.getMediaStreamTrack();
        if (videoStreamTrack.readyState !== "live") {
            videoTrack.stop();
            videoTrack.close();
            throw new Error("Video track is not live.");
        }

        await attachLocalVideo(videoTrack, userName);
        await client.publish(videoTrack);
        console.log("Video track published");
        localTracks.videoTrack = videoTrack;
        camBtn.textContent = "Turn Off Camera";
        detectBtn.disabled = false;
    }

    const form = document.getElementById('roomForm');
    form.onsubmit = async function(event) {
        event.preventDefault();
        const userName = document.getElementById('userName').value.trim();
        const roomName = document.getElementById('roomName').value.trim();
        if (userName && roomName) {
            // Store username globally so we can use it later
            window.currentUserName = userName;
            
            const APP_ID = "71fbf1e2263a49869725faa8404523ec";
            try {
                const { token, uid: newUid } = await fetchToken(roomName);
                uid = newUid;

                client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
                console.log("Client created with ID:", client._clientId);

                client.on('user-published', handleUserPublished);
                client.on('user-unpublished', handleUserUnpublished);

                await client.join(APP_ID, roomName, token, uid);
                console.log("Channel joined with UID:", uid);

                title.style.display = 'none'; // Hide the title
                joinSection.style.display = 'none';
                roomSection.style.display = 'block';
                camBtn.disabled = false;
                micBtn.disabled = false;
                detectBtn.disabled = true;
                camBtn.textContent = "Turn On Camera";
                micBtn.textContent = "Turn On Mic";
                connectWebSocket();

                try {
                    await enableCamera(userName);
                } catch (cameraError) {
                    console.warn("Camera was unavailable during join:", cameraError);
                    alert(`Joined room without camera. ${getDeviceErrorMessage(cameraError, "Camera")}`);
                }
            } catch (err) {
                console.error("Failed to join room:", err);
                alert("Failed to join room: " + err.message + ". Check token generation or permissions.");
                if (client) {
                    await client.leave();
                }
            }
        } else {
            alert('Please enter both name and room name!');
        }
    };

    leaveBtn.onclick = async () => {
        console.log("Leave button clicked");
        for (let trackName in localTracks) {
            if (localTracks[trackName]) {
                localTracks[trackName].stop();
                localTracks[trackName].close();
                console.log(`${trackName} stopped and closed`);
            }
        }
        localTracks = { videoTrack: null, audioTrack: null };
        localVideoElement = null;
        if (ws) ws.close();
        if (client) await client.leave();
        videoContainer.innerHTML = ''; // Clear all videos
        title.style.display = 'block'; // Show the title again
        joinSection.style.display = 'block';
        roomSection.style.display = 'none';
        subtitle.style.display = 'none'; // Hide the subtitle
        leaveBtn.disabled = true;
        camBtn.disabled = true;
        micBtn.disabled = true;
        detectBtn.disabled = true;
        camBtn.textContent = "Turn On Camera";
        micBtn.textContent = "Turn On Mic";
        detectBtn.textContent = "Detect Sign Language";
        subtitle.textContent = "Translation: [None]";
        isDetecting = false;
        window.currentUserName = null; // Clear username
        console.log("Left channel");
    };

    camBtn.onclick = async () => {
        console.log("Camera button clicked, current state:", localTracks.videoTrack?.enabled);
        if (!localTracks.videoTrack) {
            try {
                await enableCamera(window.currentUserName || "Me");
            } catch (err) {
                console.error("Failed to create or publish video track:", err);
                alert(getDeviceErrorMessage(err, "Camera"));
                return;
            }
        } else {
            const wasEnabled = localTracks.videoTrack.enabled;
            localTracks.videoTrack.setEnabled(!wasEnabled);
            camBtn.textContent = localTracks.videoTrack.enabled ? "Turn Off Camera" : "Turn On Camera";
            console.log("Camera toggled, new state:", localTracks.videoTrack.enabled);

            if (localTracks.videoTrack.enabled && !localVideoElement.srcObject) {
                console.log("Reconnecting stream after enable");
                const stream = new MediaStream();
                stream.addTrack(localTracks.videoTrack.getMediaStreamTrack());
                localVideoElement.srcObject = stream;
                await localVideoElement.play().catch(err => {
                    console.error("Re-play failed:", err);
                    alert("Failed to replay video: " + err.message);
                });
            }
            detectBtn.disabled = !localTracks.videoTrack.enabled;
        }
    };

    micBtn.onclick = async () => {
        console.log("Mic button clicked");
        if (!localTracks.audioTrack) {
            try {
                localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                console.log("Audio track created:", localTracks.audioTrack);
                const audioStreamTrack = localTracks.audioTrack.getMediaStreamTrack();
                if (audioStreamTrack.readyState !== "live") {
                    console.warn("Audio track is not live. ReadyState:", audioStreamTrack.readyState);
                    alert("Audio track is not live.");
                    localTracks.audioTrack = null;
                    return;
                }
                await client.publish(localTracks.audioTrack);
                console.log("Audio track published");
                micBtn.textContent = "Turn Off Mic";
            } catch (err) {
                console.error("Failed to create or publish audio track:", err);
                alert("Microphone access or publish failed: " + err.message);
                return;
            }
        } else {
            localTracks.audioTrack.setEnabled(!localTracks.audioTrack.enabled);
            micBtn.textContent = localTracks.audioTrack.enabled ? "Turn Off Mic" : "Turn On Mic";
            console.log("Mic toggled, enabled:", localTracks.audioTrack.enabled);
        }
    };

    detectBtn.onclick = () => {
        console.log("Detect button clicked");
        if (!localTracks.videoTrack || !localTracks.videoTrack._videoElement) {
            alert("No video track or feed available.");
            return;
        }

        if (isDetecting) {
            isDetecting = false;
            detectBtn.textContent = "Detect Sign Language";
            subtitle.style.display = 'none';
            subtitle.textContent = "Translation: [None]";
            console.log("Stopped sign language detection");
            return;
        }

        connectWebSocket();
        waitForWebSocketOpen(ws)
            .then(() => {
                isDetecting = true;
                detectBtn.textContent = "Stop Detection";
                subtitle.style.display = 'block';
                detectSigns();
            })
            .catch((socketError) => {
                console.error("WebSocket was not ready:", socketError);
                alert("WebSocket connection could not be established. Please try again.");
            });
    };

    function detectSigns() {
        const videoElement = localTracks.videoTrack._videoElement;

        function captureAndSendFrame() {
            if (!isDetecting) return;

            if (videoElement.readyState < 2 || !cv) {
                console.warn("Video not ready or OpenCV not loaded, readyState:", videoElement.readyState);
                setTimeout(captureAndSendFrame, 500);
                return;
            }

            // Create a canvas with original dimensions needed for processing
            const canvas = document.createElement('canvas');
            canvas.width = 229;
            canvas.height = 229;
            const context = canvas.getContext('2d');
            context.drawImage(videoElement, 0, 0, 229, 229);

            let imageData = context.getImageData(0, 0, 229, 229);
            let data = imageData.data;

            let rgbData = new Uint8Array(229 * 229 * 3);
            for (let i = 0, j = 0; i < data.length && j < rgbData.length; i += 4, j += 3) {
                rgbData[j] = data[i];
                rgbData[j + 1] = data[i + 1];
                rgbData[j + 2] = data[i + 2];
            }

            console.log(`Sending frame, byte length: ${rgbData.length}`);
            ws.send(rgbData);
            setTimeout(captureAndSendFrame, 500);
        }

        function onOpenCvReady() {
            cv = window.cv;
            console.log("OpenCV loaded");
            captureAndSendFrame();
        }
        if (typeof cv === 'undefined') {
            window.addEventListener('opencv.js', onOpenCvReady);
        } else {
            onOpenCvReady();
        }
    }

    async function handleUserPublished(user, mediaType) {
        console.log("User published:", user.uid, mediaType);
        await client.subscribe(user, mediaType);
        
        if (mediaType === 'video') {
            // Check if container already exists for this user
            let playerContainer = document.getElementById(`remote-container-${user.uid}`);
            
            if (!playerContainer) {
                // Create container for remote user video and name
                playerContainer = document.createElement("div");
                playerContainer.className = "user-video-container";
                playerContainer.id = `remote-container-${user.uid}`;
                
                // Create video player div
                const player = document.createElement("div");
                player.id = `remote-user-${user.uid}`;
                player.className = "video-element";
                
                // Create name label
                const nameLabel = document.createElement("div");
                nameLabel.className = "user-name-label";
                nameLabel.textContent = "Remote User"; // Default name
                
                // Try to get actual user name if available through metadata
                try {
                    const userData = user.metaData ? JSON.parse(user.metaData) : null;
                    if (userData && userData.userName) {
                        nameLabel.textContent = userData.userName;
                    }
                } catch (err) {
                    console.warn("Could not parse user metadata:", err);
                }
                
                // Add video and name to container
                playerContainer.appendChild(player);
                playerContainer.appendChild(nameLabel);
                
                // Add container to video container
                videoContainer.appendChild(playerContainer);
                
                // Play video in the player
                user.videoTrack.play(player);
            } else {
                // If container exists, just play the video
                const player = document.getElementById(`remote-user-${user.uid}`);
                if (player) {
                    user.videoTrack.play(player);
                }
            }
        }
        
        if (mediaType === 'audio') {
            user.audioTrack.play();
        }
    }

    function handleUserUnpublished(user) {
        console.log("User unpublished:", user.uid);
        const container = document.getElementById(`remote-container-${user.uid}`);
        if (container) container.remove();
    }

    connectWebSocket();
