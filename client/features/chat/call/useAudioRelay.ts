"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseAudioRelayOptions = {
  enabled: boolean;
  inputStream: MediaStream | null;
  onAudioData: (chunk: string) => void;
  onDebug?: (msg: string) => void;
};

// Constants for audio processing
const SAMPLE_RATE = 16000; // 16kHz is sufficient for voice and saves bandwidth
const BUFFER_SIZE = 4096;

export function useAudioRelay({ enabled, inputStream, onAudioData, onDebug }: UseAudioRelayOptions) {
  const [isRelaying, setIsRelaying] = useState(false);
  
  // Capture refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Playback refs
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  // Initialize Audio Contexts
  useEffect(() => {
    if (enabled) {
      // Capture Context
      if (!audioContextRef.current) {
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
      }
      
      // Playback Context
      if (!playbackContextRef.current) {
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        playbackContextRef.current = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
      }

      // Resume contexts
      audioContextRef.current?.resume().catch(() => {});
      playbackContextRef.current?.resume().catch(() => {});
    }
    
    return () => {
      // Cleanup is handled in stopCapture/stopPlayback or component unmount
    };
  }, [enabled]);

  const startCapture = useCallback(async () => {
    if (!inputStream || !audioContextRef.current) return;

    try {
      const ctx = audioContextRef.current;
      
      // Create source from stream
      const source = ctx.createMediaStreamSource(inputStream);
      sourceRef.current = source;

      // Create processor
      // bufferSize, inputChannels, outputChannels
      const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert Float32 to 16-bit PCM to save bandwidth (optional, but good practice)
        // For simplicity and robustness, let's send Float32 first. 
        // Actually, let's do simple downsampling/conversion if needed, but 16kHz mono Float32 is ~64KB/s.
        // 4096 samples * 4 bytes = 16KB per chunk. ~4 chunks per second.
        // Base64 overhead ~33%. Total ~85KB/s. Acceptable for LAN/High speed, maybe heavy for slow connections.
        // Let's convert to Int16.
        
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert to Base64
        // We need to convert buffer to string to base64
        const buffer = pcmData.buffer;
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        
        onAudioData(base64);
      };

      source.connect(processor);
      processor.connect(ctx.destination); // Needed for the processor to run in some browsers
      
      setIsRelaying(true);
      onDebug?.("Started PCM audio capture");
    } catch (error) {
      console.error("Failed to start PCM capture", error);
      onDebug?.(`Failed to start PCM capture: ${error}`);
    }
  }, [inputStream, onAudioData, onDebug]);

  const stopCapture = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setIsRelaying(false);
    onDebug?.("Stopped PCM audio capture");
  }, [onDebug]);

  const playChunk = useCallback(async (base64Data: string) => {
    try {
      if (!playbackContextRef.current) return;
      const ctx = playbackContextRef.current;
      
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Decode Base64 to Int16
      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16Data = new Int16Array(bytes.buffer);
      
      // Convert Int16 to Float32
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        const int16 = int16Data[i];
        float32Data[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
      }

      // Create Audio Buffer
      const audioBuffer = ctx.createBuffer(1, float32Data.length, SAMPLE_RATE);
      audioBuffer.copyToChannel(float32Data, 0);

      // Schedule Playback
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      // Schedule for next available slot
      // If we fell behind, reset to now
      if (nextStartTimeRef.current < now) {
        nextStartTimeRef.current = now;
      }
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

    } catch (error) {
      console.error("Error playing PCM chunk", error);
    }
  }, []);

  useEffect(() => {
    if (enabled && !isRelaying) {
      startCapture();
    } else if (!enabled && isRelaying) {
      stopCapture();
    }
  }, [enabled, isRelaying, startCapture, stopCapture]);

  useEffect(() => {
    return () => {
      stopCapture();
      if (audioContextRef.current) audioContextRef.current.close();
      if (playbackContextRef.current) playbackContextRef.current.close();
    };
  }, [stopCapture]);

  return { isRelaying, playChunk };
}
