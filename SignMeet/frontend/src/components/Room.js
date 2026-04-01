import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useLocation } from 'react-router-dom';
import './Room.css';

const VideoTile = ({ label, stream, muted = false, status }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream || null;
        }
    }, [stream]);

    return (
        <article className="video-tile">
            <div className="tile-aura" />
            <div className="video-frame">
                {stream ? (
                    <video ref={videoRef} autoPlay playsInline muted={muted} />
                ) : (
                    <div className="video-placeholder">
                        <span>{status}</span>
                    </div>
                )}
            </div>
            <div className="video-meta">
                <span>{label}</span>
                <span className="video-status">{status}</span>
            </div>
        </article>
    );
};

const Room = () => {
    const location = useLocation();
    const roomName = new URLSearchParams(location.search).get('roomName') || 'SignMeet Room';
    const socketRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);

    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState([]);
    const [isCameraEnabled, setIsCameraEnabled] = useState(true);
    const [isMicEnabled, setIsMicEnabled] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState('Preparing media devices...');
    const [error, setError] = useState('');
    const [isCompactNavOpen, setIsCompactNavOpen] = useState(false);
    const [activeModal, setActiveModal] = useState(null);

    useEffect(() => {
        let isMounted = true;

        const setupRoom = async () => {
            setConnectionStatus('Joining room...');
            setError('');

            try {
                const socket = io(`http://localhost:8000/ws/video-call/${roomName}/`);
                socketRef.current = socket;

                socket.on('connect', () => {
                    if (isMounted) {
                        setConnectionStatus('Connected. Waiting for participants...');
                    }
                });

                socket.on('disconnect', () => {
                    if (isMounted) {
                        setConnectionStatus('Disconnected from signaling server.');
                    }
                });

                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (!isMounted) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                localStreamRef.current = stream;
                setLocalStream(stream);

                const peerConnection = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                peerConnectionRef.current = peerConnection;

                stream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, stream);
                });

                peerConnection.onicecandidate = event => {
                    if (event.candidate) {
                        socket.emit('candidate', { candidate: event.candidate });
                    }
                };

                peerConnection.onconnectionstatechange = () => {
                    const state = peerConnection.connectionState;

                    if (!isMounted) {
                        return;
                    }

                    if (state === 'connected') {
                        setConnectionStatus('Live call connected.');
                    } else if (state === 'connecting') {
                        setConnectionStatus('Connecting to participant...');
                    } else if (state === 'failed') {
                        setConnectionStatus('Connection failed. Try rejoining the room.');
                    } else if (state === 'disconnected') {
                        setConnectionStatus('Participant connection interrupted.');
                    }
                };

                peerConnection.ontrack = event => {
                    const [incomingStream] = event.streams;
                    if (!incomingStream) {
                        return;
                    }

                    setRemoteStreams(prevStreams => {
                        const exists = prevStreams.some(streamItem => streamItem.id === incomingStream.id);
                        return exists ? prevStreams : [...prevStreams, incomingStream];
                    });
                };

                socket.on('offer', async offer => {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    socket.emit('answer', answer);
                });

                socket.on('answer', async answer => {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                });

                socket.on('candidate', async candidate => {
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (candidateError) {
                        console.error('Error adding ICE candidate:', candidateError);
                    }
                });
            } catch (setupError) {
                console.error('Error accessing media devices:', setupError);
                if (isMounted) {
                    setError('We could not access your camera or microphone. Please check browser permissions and retry.');
                    setConnectionStatus('Unable to start the call.');
                }
            }
        };

        setupRoom();

        return () => {
            isMounted = false;

            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }

            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
                localStreamRef.current = null;
            }
        };
    }, [roomName]);

    const toggleTrack = (kind) => {
        const stream = localStreamRef.current;
        if (!stream) {
            return;
        }

        const [track] = kind === 'video' ? stream.getVideoTracks() : stream.getAudioTracks();
        if (!track) {
            return;
        }

        track.enabled = !track.enabled;

        if (kind === 'video') {
            setIsCameraEnabled(track.enabled);
        } else {
            setIsMicEnabled(track.enabled);
        }
    };

    const insightItems = [
        { label: 'Participants', value: 1 + remoteStreams.length, tone: 'warm' },
        { label: 'Camera', value: isCameraEnabled ? 'On' : 'Off', tone: 'cool' },
        { label: 'Microphone', value: isMicEnabled ? 'On' : 'Off', tone: 'accent' }
    ];

    const closeModal = () => setActiveModal(null);

    return (
        <section className="room-shell">
            <nav className="top-nav">
                <a className="brand-mark" href="#room-top">
                    <span className="brand-badge">S</span>
                    <span className="brand-copy">
                        <strong>SignMeet</strong>
                        <small>Expressive video rooms</small>
                    </span>
                </a>

                <button
                    type="button"
                    className="nav-toggle"
                    aria-label="Toggle navigation"
                    aria-expanded={isCompactNavOpen}
                    onClick={() => setIsCompactNavOpen(prev => !prev)}
                >
                    <span />
                    <span />
                    <span />
                </button>

                <div className={`nav-links ${isCompactNavOpen ? 'open' : ''}`}>
                    <a href="#room-top">Overview</a>
                    <a href="#room-insights">Insights</a>
                    <a href="#room-streams">Streams</a>
                    <button type="button" className="nav-link-button" onClick={() => setActiveModal('login')}>Login</button>
                    <button type="button" className="nav-cta" onClick={() => setActiveModal('signup')}>Sign Up</button>
                </div>
            </nav>

            <header className="room-hero" id="room-top">
                <div>
                    <p className="eyebrow">SignMeet Video Space</p>
                    <h1>{roomName}</h1>
                    <p className="room-description">
                        A focused video room for sign-first conversations, quick handoffs, and low-friction joining.
                    </p>
                    <div className="hero-actions">
                        <a className="hero-chip primary" href="#room-streams">Jump to Live View</a>
                        <a className="hero-chip" href="#room-insights">Check Room Status</a>
                    </div>
                </div>
                <div className="status-panel">
                    <span className="status-dot" />
                    <div>
                        <strong>Session Status</strong>
                        <p>{connectionStatus}</p>
                    </div>
                </div>
            </header>

            {error ? <div className="callout error-callout">{error}</div> : null}

            <div className="control-row">
                <button type="button" className={`control-button ${isCameraEnabled ? 'camera-live' : 'muted'}`} onClick={() => toggleTrack('video')}>
                    <span className="button-icon" aria-hidden="true">{isCameraEnabled ? 'CAM' : 'OFF'}</span>
                    <span className="button-copy">
                        <strong>{isCameraEnabled ? 'Camera Active' : 'Camera Paused'}</strong>
                        <small>{isCameraEnabled ? 'Tap to switch video off' : 'Bring your video back live'}</small>
                    </span>
                </button>
                <button type="button" className={`control-button ${isMicEnabled ? 'mic-live' : 'muted'}`} onClick={() => toggleTrack('audio')}>
                    <span className="button-icon" aria-hidden="true">{isMicEnabled ? '))' : 'x'}</span>
                    <span className="button-copy">
                        <strong>{isMicEnabled ? 'Mic Open' : 'Mic Muted'}</strong>
                        <small>{isMicEnabled ? 'Quiet the room in one tap' : 'Unmute and join the conversation'}</small>
                    </span>
                </button>
            </div>

            <div className="insight-grid" id="room-insights">
                {insightItems.map((item, index) => (
                    <div
                        key={item.label}
                        className={`insight-card ${item.tone}`}
                        style={{ animationDelay: `${index * 120}ms` }}
                    >
                        <div className="insight-orb" />
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                    </div>
                ))}
            </div>

            <div className="video-grid" id="room-streams">
                <VideoTile
                    label="You"
                    stream={localStream}
                    muted
                    status={localStream ? (isCameraEnabled ? 'Camera live' : 'Camera paused') : 'Starting camera...'}
                />
                {remoteStreams.length > 0 ? (
                    remoteStreams.map((stream, index) => (
                        <VideoTile
                            key={stream.id || `remote-${index}`}
                            label={`Participant ${index + 1}`}
                            stream={stream}
                            status="Connected"
                        />
                    ))
                ) : (
                    <VideoTile label="Guest slot" stream={null} status="Waiting for another participant..." />
                )}
            </div>

            {activeModal ? (
                <div className="modal-backdrop" role="presentation" onClick={closeModal}>
                    <div
                        className="auth-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`${activeModal}-title`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button type="button" className="modal-close" aria-label="Close popup" onClick={closeModal}>x</button>
                        <p className="modal-eyebrow">{activeModal === 'login' ? 'Welcome back' : 'Create your account'}</p>
                        <h2 id={`${activeModal}-title`}>{activeModal === 'login' ? 'Login to SignMeet' : 'Sign up for SignMeet'}</h2>
                        <p className="modal-copy">
                            {activeModal === 'login'
                                ? 'Jump back into your room, manage invites, and continue your conversations.'
                                : 'Set up your profile and start hosting expressive, sign-first meetings in minutes.'}
                        </p>

                        <form className="auth-form">
                            {activeModal === 'signup' ? (
                                <label className="field">
                                    <span>Full Name</span>
                                    <input type="text" placeholder="Enter your name" />
                                </label>
                            ) : null}
                            <label className="field">
                                <span>Email</span>
                                <input type="email" placeholder="name@example.com" />
                            </label>
                            <label className="field">
                                <span>Password</span>
                                <input type="password" placeholder="Enter your password" />
                            </label>
                            {activeModal === 'signup' ? (
                                <label className="field">
                                    <span>Confirm Password</span>
                                    <input type="password" placeholder="Re-enter your password" />
                                </label>
                            ) : null}

                            <button type="submit" className="auth-submit">
                                {activeModal === 'login' ? 'Login' : 'Create Account'}
                            </button>
                        </form>

                        <button
                            type="button"
                            className="modal-switch"
                            onClick={() => setActiveModal(activeModal === 'login' ? 'signup' : 'login')}
                        >
                            {activeModal === 'login' ? 'Need an account? Sign up' : 'Already have an account? Login'}
                        </button>
                    </div>
                </div>
            ) : null}
        </section>
    );
};

export default Room;
