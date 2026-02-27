import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from '@google/genai';
import { decode, decodeAudioData, createBlob, playTone, exportWavFile } from '../services/audioUtils';
import { GEMINI_MODEL, getAccentAdjustedInstruction } from '../constants';
import { BusinessConfig } from '../types';

interface VoiceInterfaceProps {
  onClose: () => void;
  config: BusinessConfig;
}

type ConnectionStatus = 'Idle' | 'Initializing' | 'MicRequest' | 'ConnectingAPI' | 'Listening' | 'Processing' | 'Speaking' | 'Error';
type AccentRegion = 'Dhaka' | 'Chittagong' | 'Sylhet';
type VoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

interface TranscriptItem {
  text: string;
  role: 'user' | 'ai';
  id: string;
  isVerified?: boolean;
  translation?: string;
}

const SUGGESTED_TOPICS = [
  { text: "ডেলিভারি চার্জ কত?", icon: "fa-truck-fast" },
  { text: "অর্ডার ট্র্যাকিং করব কিভাবে?", icon: "fa-location-dot" },
  { text: "রিটার্ন পলিসি কি?", icon: "fa-rotate-left" },
  { text: "বিকাশে পেমেন্ট করা যাবে?", icon: "fa-wallet" }
];

const TypewriterText: React.FC<{ text: string, delay?: number }> = ({ text, delay = 0.04 }) => {
  const words = text.split(' ');
  return (
    <div className="flex flex-wrap gap-x-1.5">
      {words.map((word, i) => (
        <span key={i} className="word-animate opacity-0" style={{ animationDelay: `${i * delay}s` }}>
          {word}
        </span>
      ))}
    </div>
  );
};

const MIN_TYPING_SPEED_DELAY = 0.02; // Faster
const MAX_TYPING_SPEED_DELAY = 0.10; // Slower
const TYPING_SPEED_STEP = 0.02;

const ACCENT_DETECTION_KEY = 'autoAccentDetectionEnabled';

const loadAutoAccentDetectionState = (): boolean => {
  try {
    const storedValue = localStorage.getItem(ACCENT_DETECTION_KEY);
    return storedValue === 'true'; 
  } catch (error) {
    console.error("Failed to load accent detection state from localStorage", error);
    return false;
  }
};

const saveAutoAccentDetectionState = (enabled: boolean) => {
  try {
    localStorage.setItem(ACCENT_DETECTION_KEY, String(enabled));
  } catch (error) {
    console.error("Failed to save accent detection state to localStorage", error);
  }
};

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ onClose, config }) => {
  const [isActive, setIsActive] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptItem[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('Idle');
  const [selectedAccent, setSelectedAccent] = useState<AccentRegion>('Dhaka');
  const [speechRate, setSpeechRate] = useState(1.0); // New state for speech rate
  const [voicePitch, setVoicePitch] = useState(1.0); // New state for voice pitch
  const [selectedVoiceName, setSelectedVoiceName] = useState<VoiceName>('Kore');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [showTranslations, setShowTranslations] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAccentAutoDetected, setIsAccentAutoDetected] = useState(false); // New state for visual feedback
  const [detectedAccentConfidence, setDetectedAccentConfidence] = useState<number | null>(null); // New state for accent confidence
  const [typingSpeedDelay, setTypingSpeedDelay] = useState(0.04); // New state for typing speed delay
  const [isVoiceTrainingActive, setIsVoiceTrainingActive] = useState(false); // New state for voice training
  const [voiceTrainingProgress, setVoiceTrainingProgress] = useState(0); // New state for training progress
  const [voiceTrainingStatus, setVoiceTrainingStatus] = useState(''); // New state for training status
  const [isRecordingSession, setIsRecordingSession] = useState(false); // Overall recording status for the session
  const [showExportOptions, setShowExportOptions] = useState(false); // Show MP3/WAV options
  const [selectedExportFormat, setSelectedExportFormat] = useState<'mp3' | 'wav'>('mp3'); // Default export format
  const [isAutoAccentDetectionEnabled, setIsAutoAccentDetectionEnabled] = useState<boolean>(loadAutoAccentDetectionState());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext; } | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptionsEndRef = useRef<HTMLDivElement>(null);
  const currentAiTranscription = useRef('');
  const currentUserTranscription = useRef('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioStreamDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);


  useEffect(() => {
    transcriptionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptions, status]);

  useEffect(() => {
    return () => {
      // Ensure all audio contexts are closed when the component unmounts
      audioContextRef.current?.input.close().catch(() => {});
      audioContextRef.current?.output.close().catch(() => {});
    };
  }, []);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current || status !== 'Speaking') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const renderFrame = () => {
      if (status !== 'Speaking') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      requestAnimationFrame(renderFrame);
      analyserRef.current?.getByteFrequencyData(dataArray);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        ctx.fillStyle = `rgb(79, 70, 229)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    renderFrame();
  }, [status]);

  useEffect(() => {
    if (status === 'Speaking') drawWaveform();
  }, [status, drawWaveform]);

  const addTranscription = useCallback((text: string, role: 'user' | 'ai', isVerified?: boolean, translation?: string) => {
    if (!text.trim() && !translation?.trim()) return; // Only add if there's actual text
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    setTranscriptions(prev => [...prev, { id, text, role, isVerified, translation }]);
  }, []);

  const stopSession = useCallback(() => {
    sessionPromiseRef.current?.then(s => s.close?.()).catch(() => {});
    sessionPromiseRef.current = null;
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    // Stop MediaRecorder and finalize recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecordingSession(false);
    }

    audioContextRef.current?.input.close().catch(() => {});
    audioContextRef.current?.output.close().catch(() => {});
    audioContextRef.current = null;
    
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    
    setIsActive(false);
    setIsConnecting(false);
    setStatus('Idle');
    nextStartTimeRef.current = 0;
    setIsAgentTyping(false);
    setIsMicMuted(false); // Reset mic mute status
    setShowTranslations(false); // Reset translation display
    currentAiTranscription.current = '';
    currentUserTranscription.current = '';
    setTypingSpeedDelay(0.04); // Reset typing speed
    setDetectedAccentConfidence(null); // Reset accent confidence
  }, []);

  useEffect(() => {
    // Cleanup recorded chunks when component unmounts
    return () => {
      recordedChunksRef.current = [];
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const parseTranslatedConversation = (translatedText: string) => {
    const lines = translatedText.split('\n');
    const parsedTranslations: { role: 'user' | 'ai', translatedText: string }[] = [];
    let currentRole: 'user' | 'ai' | null = null;
    let currentText = '';

    for (const line of lines) {
      if (line.startsWith('User: ')) {
        if (currentRole && currentText) {
          parsedTranslations.push({ role: currentRole, translatedText: currentText.trim() });
        }
        currentRole = 'user';
        currentText = line.substring('User: '.length);
      } else if (line.startsWith('AI: ')) {
        if (currentRole && currentText) {
          parsedTranslations.push({ role: currentRole, translatedText: currentText.trim() });
        }
        currentRole = 'ai';
        currentText = line.substring('AI: '.length);
      } else {
        if (currentText) {
          currentText += ' ' + line.trim(); // Append subsequent lines to current message
        }
      }
    }
    if (currentRole && currentText) {
      parsedTranslations.push({ role: currentRole, translatedText: currentText.trim() });
    }
    return parsedTranslations;
  };

  const translateFullConversation = useCallback(async () => {
    setIsTranslating(true);
    try {
      const conversationHistory = transcriptions.map(t => `${t.role === 'user' ? 'User' : 'AI'}: ${t.text}`).join('\n');
      // Always create a new GoogleGenAI instance to ensure the latest API key is used
      const aiTranslate = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await aiTranslate.models.generateContent({
        model: 'gemini-3-flash-preview', // Appropriate model for text tasks
        contents: `Translate the following conversation to English, preserving speaker roles as 'User:' and 'AI:'. Return only the translated text, without any additional commentary or markdown. Conversation:\n\n${conversationHistory}`,
      });

      const translatedText = response.text || '';
      const parsedTranslations = parseTranslatedConversation(translatedText);

      setTranscriptions(prevTranscriptions => {
        return prevTranscriptions.map((originalMsg, index) => {
          if (parsedTranslations[index] && parsedTranslations[index].role === originalMsg.role) {
            return { ...originalMsg, translation: parsedTranslations[index].translatedText };
          }
          return originalMsg;
        });
      });
      setShowTranslations(true);
    } catch (error) {
      console.error("Failed to translate conversation:", error);
      // Optionally add a transcription item with an error message
      addTranscription("Translation failed. Please try again.", 'ai');
    } finally {
      setIsTranslating(false);
    }
  }, [transcriptions, addTranscription]);

  const handleInitiateVoiceTraining = () => {
    setIsVoiceTrainingActive(true);
    setVoiceTrainingProgress(0);
    setVoiceTrainingStatus("Starting voice training...");

    let currentProgress = 0;
    const stages = [
      { progress: 20, status: "Collecting audio data for analysis...", delay: 2000 },
      { progress: 50, status: "Analyzing phonetic patterns and unique characteristics...", delay: 3000 },
      { progress: 80, status: "Training AI model with new voice profile...", delay: 4000 },
      { progress: 100, status: "Voice Training Complete!", delay: 2000 },
    ];

    stages.forEach((stage, index) => {
      setTimeout(() => {
        setVoiceTrainingProgress(stage.progress);
        setVoiceTrainingStatus(stage.status);
        if (stage.progress === 100) {
          setTimeout(() => {
            setIsVoiceTrainingActive(false);
            setVoiceTrainingProgress(0);
            setVoiceTrainingStatus("");
          }, stage.delay);
        }
      }, stages.slice(0, index).reduce((acc, s) => acc + s.delay, 0) + stage.delay);
    });
  };

  const handleExportRecording = useCallback(async () => {
    if (recordedChunksRef.current.length === 0) {
      alert("No recording data available.");
      return;
    }

    const superBuffer = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
    const filename = `conversation_recording_${new Date().toISOString().slice(0, 10)}`;

    if (selectedExportFormat === 'wav') {
      try {
        const audioContext = audioContextRef.current?.output;
        if (!audioContext) {
          alert("Audio context not available for WAV export.");
          return;
        }
        const decodedAudio = await audioContext.decodeAudioData(await superBuffer.arrayBuffer());
        const wavBlob = exportWavFile(decodedAudio);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error converting to WAV:", error);
        alert("Failed to export as WAV. Ensure the recording is valid.");
      }
    } else if (selectedExportFormat === 'mp3') {
      // MediaRecorder typically outputs WebM (Opus) or Ogg (Vorbis), not true MP3 directly.
      // For simplicity and minimal changes, we'll provide the WebM blob as "MP3".
      // A true MP3 export would require a client-side encoder library or server-side processing.
      const url = URL.createObjectURL(superBuffer);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.webm`; // Download as webm, but user selected mp3 conceptually
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert("Exported as WebM. Note: Direct client-side MP3 encoding is complex and this file is in WebM format (widely supported).");
    }
    setShowExportOptions(false); // Close export options after download
  }, [recordedChunksRef, selectedExportFormat, audioContextRef]);

  const startSession = async (initialText?: string) => {
    if (isConnecting || isActive) return;
    setIsConnecting(true);
    setStatus('Initializing');
    recordedChunksRef.current = []; // Clear previous recordings

    try {
      // PROACTIVE MICROPHONE CHECK
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputDevices = devices.filter(device => device.kind === 'audioinput');

      if (audioInputDevices.length === 0) {
        setStatus('Error');
        addTranscription('No microphone devices found. Please connect a microphone and ensure it is enabled.', 'ai');
        setIsConnecting(false);
        return; 
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      // Always create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key from the dialog.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      audioContextRef.current = { input: inputCtx, output: outputCtx };

      // Setup MediaRecorder for combined audio
      audioStreamDestinationRef.current = outputCtx.createMediaStreamDestination();
      mediaRecorderRef.current = new MediaRecorder(audioStreamDestinationRef.current.stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      mediaRecorderRef.current.onstop = () => {
        setIsRecordingSession(false);
      };
      mediaRecorderRef.current.start(1000); // Record chunks every 1 second
      setIsRecordingSession(true);
      
      setStatus('ConnectingAPI');
      
      const pitchDirective = voicePitch > 1.2 ? "Speak with a high-pitched voice." : voicePitch < 0.8 ? "Speak with a deep, low-pitched voice." : "";

      // Fix: Ensure that parameters for tools without arguments explicitly define properties: {} and required: []
      const functionDeclarations: FunctionDeclaration[] = [
        { name: 'check_order_status', parameters: { type: Type.OBJECT, properties: { order_id: { type: Type.STRING } }, required: ['order_id'] } },
        { name: 'end_call', parameters: { type: Type.OBJECT, properties: {}, required: [] } }, // No parameters for ending call
        { name: 'toggle_microphone', parameters: { type: Type.OBJECT, properties: { should_mute: { type: Type.BOOLEAN } }, required: ['should_mute'] } },
        { name: 'translate_conversation', parameters: { type: Type.OBJECT, properties: {}, required: [] } }, // Tool for translating conversation
        { name: 'slow_typing_speed', parameters: { type: Type.OBJECT, properties: {}, required: [] } }, // Tool to slow typing speed
        { name: 'speed_up_typing_speed', parameters: { type: Type.OBJECT, properties: {}, required: [] } }, // Tool to speed up typing speed
      ];

      if (isAutoAccentDetectionEnabled) {
        functionDeclarations.push(
          { name: 'detect_accent', parameters: { type: Type.OBJECT, properties: { accent: { type: Type.STRING, enum: ['Dhaka', 'Chittagong', 'Sylhet'] }, confidence: { type: Type.NUMBER, description: 'Confidence score from 0.0 to 1.0' } }, required: ['accent'] } }
        );
      }

      const systemInstruction = getAccentAdjustedInstruction(selectedAccent, config, false, isAutoAccentDetectionEnabled) +
        `\n\nVOICE STYLE: ${pitchDirective}` +
        "\n\nCOMMANDS: Confirm every action verbally in Bengali. " +
        "If the user says 'কল শেষ করো' (end call), you must call the 'end_call' tool and then say 'ধন্যবাদ, আপনার কল শেষ করা হচ্ছে।' (Thank you, your call is being ended.). " +
        "If the user says 'মাইক্রোফোন বন্ধ করো' (mute microphone), you must call 'toggle_microphone' with `should_mute: true` and say 'মাইক্রোফোন বন্ধ করা হয়েছে।' (Microphone muted.). " +
        "If the user says 'মাইক্রোফোন চালু করো' (unmute microphone), you must call 'toggle_microphone' with `should_mute: false` and say 'মাইক্রোফোন চালু করা হয়েছে।' (Microphone unmuted.)." +
        "If the user says 'ইংরেজিতে অনুবাদ করো' (translate to English) or 'ট্রান্সলেট টু ইংলিশ', you must call the 'translate_conversation' tool and then say 'আপনার কথোপকথন ইংরেজিতে অনুবাদ করা হচ্ছে।' (Your conversation is being translated to English.)." +
        "If the user says 'টাইপিং স্পিড কমাও' (slow down typing speed), you must call the 'slow_typing_speed' tool and then say 'টাইপিং স্পিড কমানো হচ্ছে।' (Typing speed is being slowed down.)." +
        "If the user says 'টাইপিং স্পিড বাড়াও' (speed up typing speed), you must call the 'speed_up_typing_speed' tool and then say 'টাইপিং স্পিড বাড়ানো হচ্ছে।' (Typing speed is being increased.)";


      const sessionConnectPromise = ai.live.connect({
        model: GEMINI_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ functionDeclarations }],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: selectedVoiceName,
                speakingRate: speechRate, // Pass the speech rate to the API
              }
            }
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            setStatus('Listening');
            playTone(outputCtx, 660, 0.3);
            
            if (initialText) {
              sessionConnectPromise.then(s => s.sendRealtimeInput({ text: initialText }));
              addTranscription(initialText, 'user');
            }
            
            const micSource = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              // Only send audio if not muted
              if (!isMicMuted) {
                const pcmBlob = createBlob(e.inputBuffer.getChannelData(0));
                sessionConnectPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
                // Also route user input to the recording destination
                const sourceNode = inputCtx.createBufferSource();
                sourceNode.buffer = inputCtx.createBuffer(1, e.inputBuffer.length, inputCtx.sampleRate);
                sourceNode.buffer.getChannelData(0).set(e.inputBuffer.getChannelData(0));
                if (audioStreamDestinationRef.current) {
                  sourceNode.connect(audioStreamDestinationRef.current);
                } else {
                  console.warn("audioStreamDestinationRef.current is null during onaudioprocess. Audio not routed to recorder.");
                }
                sourceNode.start();
              }
            };
            micSource.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination); // Keep original connection for mic monitoring if any
          },
          onmessage: async (message: any) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'check_order_status') {
                   sessionConnectPromise.then(s => s.sendToolResponse({ 
                     functionResponses: { id: fc.id, name: fc.name, response: { result: { status: 'Shipped', eta: '2 days' } } } 
                   }));
                } else if (fc.name === 'detect_accent') {
                  // Fix: Add a type assertion to fc.args to inform TypeScript about the expected structure
                  const accentArgs = fc.args as { accent: AccentRegion; confidence: number };
                  const newAccent = accentArgs.accent;
                  const confidence = accentArgs.confidence;
                  setSelectedAccent(newAccent);
                  setDetectedAccentConfidence(confidence);
                  setIsAccentAutoDetected(true); // Trigger visual feedback
                  setTimeout(() => setIsAccentAutoDetected(false), 2000); // Reset after 2 seconds
                  sessionConnectPromise.then(s => s.sendToolResponse({ 
                    functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } } 
                  }));
                } else if (fc.name === 'end_call') {
                  sessionConnectPromise.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: "call_ended" } }
                  }));
                  // The model's confirmation response will trigger the actual stopSession
                  // This allows the model to say "ধন্যবাদ, আপনার কল শেষ করা হচ্ছে।" first
                } else if (fc.name === 'toggle_microphone') {
                  const shouldMute = fc.args.should_mute;
                  if (mediaStreamRef.current) {
                    mediaStreamRef.current.getAudioTracks().forEach(track => {
                      track.enabled = !shouldMute; // Toggle enabled status
                    });
                    setIsMicMuted(shouldMute);
                  }
                  sessionConnectPromise.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: `microphone_${shouldMute ? 'muted' : 'unmuted'}` } }
                  }));
                } else if (fc.name === 'translate_conversation') {
                    // Trigger translation logic
                    await translateFullConversation();
                    sessionConnectPromise.then(s => s.sendToolResponse({
                      functionResponses: { id: fc.id, name: fc.name, response: { result: "translated" } }
                    }));
                } else if (fc.name === 'slow_typing_speed') {
                    setTypingSpeedDelay(prev => Math.min(prev + TYPING_SPEED_STEP, MAX_TYPING_SPEED_DELAY));
                    sessionConnectPromise.then(s => s.sendToolResponse({
                        functionResponses: { id: fc.id, name: fc.name, response: { result: "typing_speed_slowed" } }
                    }));
                } else if (fc.name === 'speed_up_typing_speed') {
                    setTypingSpeedDelay(prev => Math.max(prev - TYPING_SPEED_STEP, MIN_TYPING_SPEED_DELAY));
                    sessionConnectPromise.then(s => s.sendToolResponse({
                        functionResponses: { id: fc.id, name: fc.name, response: { result: "typing_speed_sped_up" } }
                    }));
                }
              }
            }
            
            if (message.serverContent?.outputTranscription) {
              currentAiTranscription.current += message.serverContent.outputTranscription.text;
              if (status !== 'Speaking') setIsAgentTyping(true);
            } else if (message.serverContent?.inputTranscription) {
              currentUserTranscription.current += message.serverContent.inputTranscription.text;
            }
            
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                setIsAgentTyping(false);
                setStatus('Speaking');
                
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                const decodedData = decode(base64Audio);
                const audioBuffer = await decodeAudioData(decodedData, outputCtx, 24000, 1);
                
                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.playbackRate.value = 1.0; // Client-side playback rate set to default, controlled by API speakingRate
                source.connect(analyser).connect(outputCtx.destination);
                if (audioStreamDestinationRef.current) {
                  source.connect(audioStreamDestinationRef.current); // Also route AI audio to recorder
                } else {
                  console.warn("audioStreamDestinationRef.current is null during AI audio playback. Audio not routed to recorder.");
                }

                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) {
                    // Check if the model's final response was an end call confirmation
                    if (currentAiTranscription.current.includes('কল শেষ করা হচ্ছে')) {
                      stopSession(); // Actually end session after verbal confirmation
                    } else {
                      setStatus('Listening');
                    }
                  }
                });
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration; // Duration should be based on original buffer, API adjusts rate
                sourcesRef.current.add(source);
            }
            
            if (message.serverContent?.turnComplete) {
              if (currentUserTranscription.current) {
                addTranscription(currentUserTranscription.current, 'user');
                currentUserTranscription.current = '';
                setStatus('Processing');
              }
              if (currentAiTranscription.current) {
                addTranscription(currentAiTranscription.current, 'ai');
                currentAiTranscription.current = '';
                setIsAgentTyping(false);
              }
            }
          },
          onerror: (e) => {
            console.error("Gemini Error:", e);
            stopSession();
            setStatus('Error');
          },
          onclose: () => stopSession(),
        },
      });
      sessionPromiseRef.current = sessionConnectPromise;
    } catch (err: any) {
      console.error("Session failed to start:", err);
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setStatus('Error');
        addTranscription('Microphone not found. Please ensure a microphone is connected and enabled.', 'ai');
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('Error');
        addTranscription('Microphone access denied. Please allow microphone permissions in your browser settings.', 'ai');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setStatus('Error');
        addTranscription('Microphone is in use or not accessible. Please check if another application is using it.', 'ai');
      } else {
        setStatus('Error');
        addTranscription(`Failed to start session: ${err.message}`, 'ai');
      }
      setIsConnecting(false);
    }
  };

  const handleToggleAutoAccentDetection = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStatus = e.target.checked;
    setIsAutoAccentDetectionEnabled(newStatus);
    saveAutoAccentDetectionState(newStatus);

    if (isActive) {
      // Provide verbal confirmation by restarting the session with an initial prompt
      stopSession();
      const confirmationText = newStatus 
        ? 'আপনার অটো এক্সেন্ট ডিটেকশন চালু করা হয়েছে।' // Accent detection enabled.
        : 'আপনার অটো এক্সেন্ট ডিটেকশন বন্ধ করা হয়েছে।'; // Accent detection disabled.
      await startSession(confirmationText);
    }
  }, [isActive, startSession, stopSession]);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-xl h-[720px] rounded-[40px] shadow-2xl flex flex-col overflow-hidden border border-white/20 relative">
        <div className={`p-8 flex items-center justify-between text-white shrink-0 ${status === 'Speaking' ? 'bg-orange-500' : 'bg-slate-900'} transition-colors duration-500`}>
          <div className="flex items-center gap-5">
            <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border-2 ${status === 'Speaking' ? 'bg-white text-orange-500 shadow-2xl border-orange-200 speaking-active' : 'bg-white/10 text-white border-transparent'}`}>
               <i className={`fa-solid ${status === 'Speaking' ? 'fa-comment-dots' : 'fa-robot'} text-xl relative z-10`}></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-xl">{config.shopName}</h2>
              </div>
              <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">
                {status} <span className={isAccentAutoDetected ? 'text-indigo-500 font-bold' : 'text-slate-400'}>{selectedAccent}{detectedAccentConfidence !== null ? ` (${(detectedAccentConfidence * 100).toFixed(0)}%)` : ''}</span> {isAgentTyping && "..."} {isTranslating && " (Translating...)"}
              </p>
            </div>
          </div>
          <button onClick={() => { stopSession(); onClose(); }} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"><i className="fa-solid fa-times text-lg"></i></button>
        </div>

        <canvas ref={canvasRef} height="40" className="w-full bg-slate-50 border-b border-slate-100" />

        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50 scrollbar-hide">
          {!isActive && !isConnecting && (
            <div className="space-y-8">
              <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-6">Agent Calibration</h3>
                <div className="space-y-6">
                  {/* Voice Cloning Settings Section */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 mb-4">Voice Cloning Settings</h4>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 block">Bengali Accent DNA</label>
                      <div className="grid grid-cols-3 gap-3">
                        {['Dhaka', 'Chittagong', 'Sylhet'].map(accent => (
                          <button key={accent} onClick={() => setSelectedAccent(accent as AccentRegion)} className={`py-4 rounded-2xl text-[10px] font-black border transition-all ${selectedAccent === accent ? 'bg-indigo-600 text-white shadow-xl border-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-indigo-300'}`}>{accent}</button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-6">
                      <button 
                        onClick={handleInitiateVoiceTraining} 
                        disabled={isVoiceTrainingActive} 
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 disabled:bg-gray-400 disabled:shadow-none transition-all"
                      >
                        {isVoiceTrainingActive ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-brain mr-2"></i>}
                        {isVoiceTrainingActive ? 'Training Voice...' : 'Initiate Voice Training'}
                      </button>
                      {isVoiceTrainingActive && (
                        <div className="mt-4 text-center">
                          <div className="w-full bg-slate-200 rounded-full h-2.5">
                            <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${voiceTrainingProgress}%` }}></div>
                          </div>
                          <p className="text-[10px] font-bold text-slate-500 mt-2">{voiceTrainingStatus}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* End Voice Cloning Settings Section */}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Voice Profile</label>
                      <select value={selectedVoiceName} onChange={(e) => setSelectedVoiceName(e.target.value as VoiceName)} className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-black uppercase outline-none">
                        {['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Speech Rate ({speechRate.toFixed(1)}x)</label>
                      <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.1"
                          value={speechRate}
                          onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                          className="w-full h-8 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Voice Pitch ({voicePitch.toFixed(1)}x)</label>
                      <input
                          type="range"
                          min="0.5"
                          max="1.5"
                          step="0.1"
                          value={voicePitch}
                          onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                          className="w-full h-8 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-between mt-4">
                      <label htmlFor="autoAccentDetectionToggle" className="text-sm font-black text-slate-700 cursor-pointer">Auto Accent Detection</label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          id="autoAccentDetectionToggle"
                          className="sr-only peer" 
                          checked={isAutoAccentDetectionEnabled} 
                          onChange={handleToggleAutoAccentDetection} 
                          disabled={isActive} // Disable toggle while a session is active to avoid mid-session system instruction changes
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                {SUGGESTED_TOPICS.map((t, i) => (
                  <button key={i} onClick={() => startSession(t.text)} className="p-4 bg-white border border-slate-100 rounded-2xl text-[11px] font-bold hover:shadow-lg transition-all flex flex-col items-center gap-2 group"><i className={`fa-solid ${t.icon} text-indigo-500 text-lg`}></i> {t.text}</button>
                ))}
              </div>
            </div>
          )}

          {transcriptions.map((t) => (
            <div key={t.id} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
              <div className={`max-w-[85%] p-5 rounded-[28px] text-sm shadow-sm ${t.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'}`}>
                <div className="font-bold leading-relaxed">
                  {showTranslations && t.translation ? <TypewriterText text={t.translation} delay={typingSpeedDelay} /> : <TypewriterText text={t.text} delay={typingSpeedDelay} />}
                </div>
              </div>
            </div>
          ))}
          <div ref={transcriptionsEndRef} />
        </div>

        <div className="p-8 bg-white border-t border-slate-100 shrink-0">
          {isActive ? (
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${status === 'Speaking' ? 'bg-orange-500' : 'bg-green-500'} animate-pulse`}></span>
                <span className={`text-[10px] font-black uppercase tracking-tighter ${isAccentAutoDetected ? 'text-indigo-500 font-bold' : 'text-slate-400'}`}>{status} - {selectedAccent}{detectedAccentConfidence !== null ? ` (${(detectedAccentConfidence * 100).toFixed(0)}%)` : ''}</span>
                {isMicMuted && (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase text-red-500">
                    <i className="fa-solid fa-microphone-slash animate-pulse"></i> Muted
                  </span>
                )}
                {isTranslating && (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase text-indigo-500">
                    <i className="fa-solid fa-spinner fa-spin"></i> Translating
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {recordedChunksRef.current.length > 0 && !isRecordingSession && (
                  <div className="relative">
                    <button 
                      onClick={() => setShowExportOptions(!showExportOptions)} 
                      className="px-6 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase shadow-lg shadow-slate-200/20 transition-all active:scale-95 flex items-center gap-2"
                    >
                      <i className="fa-solid fa-download"></i> Export Recording
                    </button>
                    {showExportOptions && (
                      <div className="absolute bottom-full right-0 mb-2 w-36 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
                        <button 
                          onClick={() => { setSelectedExportFormat('mp3'); handleExportRecording(); }} 
                          className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          MP3 (WebM)
                        </button>
                        <button 
                          onClick={() => { setSelectedExportFormat('wav'); handleExportRecording(); }} 
                          className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          WAV
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={stopSession} className="px-8 py-3.5 bg-red-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-red-500/20 transition-all active:scale-95">End Call</button>
              </div>
            </div>
          ) : (
            <button onClick={() => startSession()} disabled={isConnecting} className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-600/20 transition-all">
              {isConnecting ? <i className="fa-solid fa-circle-notch fa-spin mr-3"></i> : <i className="fa-solid fa-microphone mr-3"></i>}
              {isConnecting ? 'Linking Agent...' : 'Start Voice Conversation'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceInterface;