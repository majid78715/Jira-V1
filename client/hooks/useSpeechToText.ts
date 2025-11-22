import { useState, useEffect, useRef, useCallback } from 'react';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';
import { apiRequest } from '../lib/apiClient';

interface SpeechToTextHook {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: (language?: string) => Promise<void>;
  stopListening: () => void;
  error: string | null;
}

export function useSpeechToText(options?: { speakerName?: string; onSegmentRecognized?: (text: string) => void }): SpeechToTextHook {
  const { speakerName, onSegmentRecognized } = options || {};
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognizerRef = useRef<speechsdk.SpeechRecognizer | null>(null);

  const stopListening = useCallback(() => {
    if (recognizerRef.current) {
      recognizerRef.current.stopContinuousRecognitionAsync(() => {
        recognizerRef.current?.close();
        recognizerRef.current = null;
        setIsListening(false);
      });
    } else {
      setIsListening(false);
    }
  }, []);

  const startListening = useCallback(async (language = 'en-US') => {
    // Prevent multiple starts
    if (recognizerRef.current) return;

    try {
      setError(null);
      
      // 1. Get the token from our backend
      console.log('[SpeechToText] Fetching token...');
      const { token, region } = await apiRequest<{ token: string; region: string }>('/calls/speech-token');
      console.log('[SpeechToText] Token received for region:', region);

      // 2. Configure Speech SDK
      const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(token, region);
      const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput();
      
      let recognizer: speechsdk.SpeechRecognizer;

      if (language === 'auto') {
        console.log('[SpeechToText] Using Auto Language Detection (EN/AR)');
        const autoDetectConfig = speechsdk.AutoDetectSourceLanguageConfig.fromLanguages(["en-US", "ar-AE"]);
        recognizer = speechsdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig);
      } else {
        speechConfig.speechRecognitionLanguage = language;
        recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig);
      }

      // 3. Set up event handlers
      recognizer.recognizing = (s, e) => {
        console.log('[SpeechToText] Recognizing:', e.result.text);
        // Partial results (what is currently being spoken)
        if (e.result.reason === speechsdk.ResultReason.RecognizingSpeech) {
          setInterimTranscript(e.result.text);
        }
      };

      recognizer.recognized = (s, e) => {
        console.log('[SpeechToText] Recognized:', e.result.text);
        // Final results (sentence completed)
        if (e.result.reason === speechsdk.ResultReason.RecognizedSpeech) {
          const text = e.result.text;
          if (onSegmentRecognized) {
            onSegmentRecognized(text);
          }
          setTranscript(prev => {
            const prefix = speakerName ? `**${speakerName}:** ` : '';
            const newSegment = `${prefix}${text}`;
            return prev ? `${prev}\n\n${newSegment}` : newSegment;
          });
          setInterimTranscript(''); // Clear interim
        }
      };

      recognizer.canceled = (s, e) => {
        console.error(`CANCELED: Reason=${e.reason}`);
        if (e.reason === speechsdk.CancellationReason.Error) {
            console.error(`CANCELED: ErrorCode=${e.errorCode}`);
            console.error(`CANCELED: ErrorDetails=${e.errorDetails}`);
            setError(`Speech recognition canceled: ${e.errorDetails}`);
            stopListening();
        }
      };

      recognizer.sessionStopped = (s, e) => {
        console.log("\n    Session stopped event.");
        stopListening();
      };

      // 4. Start recognition
      recognizerRef.current = recognizer;
      recognizer.startContinuousRecognitionAsync(() => {
        setIsListening(true);
      }, (err) => {
        console.error(err);
        setError('Failed to start recording');
        setIsListening(false);
      });

    } catch (err) {
      console.error('Error starting speech recognition:', err);
      setError('Could not start speech recognition');
      setIsListening(false);
    }
  }, [stopListening, speakerName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognizerRef.current) {
        recognizerRef.current.close();
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    error
  };
}
