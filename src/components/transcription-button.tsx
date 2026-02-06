import { IconMicrophone, IconMicrophoneOff } from "@tabler/icons-react";
import { use$ } from "applesauce-react/hooks";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { from, of } from "rxjs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TranscriptionButtonProps {
  onTranscription: (text: string) => void;
  onInterimTranscription?: (text: string) => void;
  className?: string;
  lang?: string;
}

/**
 * Experimental transcription button using Web Speech API
 *
 * @example
 * ```tsx
 * <TranscriptionButton
 *   onTranscriptionComplete={(text) => console.log(text)}
 *   lang="en-US"
 * />
 * ```
 */
export function TranscriptionButton({
  onTranscription,
  onInterimTranscription,
  className,
  lang = "en-US",
}: TranscriptionButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef<string>("");

  const recognition = useMemo(() => {
    if (!window.SpeechRecognition || !window.webkitSpeechRecognition)
      return null;
    return new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  }, []);

  useEffect(() => {
    // Check if Web Speech API is supported
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    // Initialize recognition
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    // Force local if possible
    // @ts-expect-error
    recognition.processLocally = true;

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        transcriptRef.current += finalTranscript;
        onInterimTranscription?.(finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setError(`Error: ${event.error}`);
      setIsRecording(false);
    };

    recognition.onend = () => {
      // If recording was stopped intentionally, we handle it in handleClick
      // This catches unexpected ends
      if (isRecording) {
        setIsRecording(false);

        const finalText = transcriptRef.current.trim();
        if (finalText) {
          onTranscription(finalText);
        }

        // Reset transcript for next recording
        transcriptRef.current = "";
        setError(null);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore errors on cleanup
        }
      }
    };
  }, [lang]);

  const languageSupported = use$<
    "available" | "downloadable" | "unavailable" | "unknown"
  >(
    () =>
      recognition
        ? // Use new method to check for support
          // @ts-expect-error
          recognition.available
          ? from(
              // @ts-expect-error
              recognition.available({
                langs: [lang],
                processLocally: true,
              }) as Promise<"available" | "downloadable" | "unavailable">,
            )
          : // Assume its supported
            of("unknown")
        : of("unavailable"),
    [lang, recognition],
  );

  const handleClick = () => {
    if (!recognitionRef.current) {
      setError("Speech recognition not initialized");
      return;
    }

    if (isRecording) {
      // Stop recording and return transcript
      recognitionRef.current.abort();
      setIsRecording(false);
    } else {
      // Start recording
      try {
        transcriptRef.current = "";
        recognitionRef.current.start();
        setIsRecording(true);
        setError(null);
      } catch (err) {
        console.error("Error starting recognition:", err);
        setError("Failed to start recording");
      }
    }
  };

  // Disappears if there is an error
  if (error)
    return (
      <Button
        type="button"
        variant="destructive"
        size="icon"
        title={error}
        onClick={() => alert(error)}
      >
        <AlertTriangle className="h-4 w-4" />
      </Button>
    );

  return (
    <Button
      type="button"
      variant={isRecording ? "destructive" : "outline"}
      size="icon"
      onClick={handleClick}
      disabled={!recognition}
      className={cn(
        "transition-colors",
        isRecording && "animate-pulse",
        className,
      )}
      title={error || languageSupported}
    >
      {isRecording ? (
        <IconMicrophoneOff className="h-4 w-4" />
      ) : (
        <IconMicrophone className="h-4 w-4" />
      )}
    </Button>
  );
}
