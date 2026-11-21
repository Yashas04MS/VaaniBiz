import { useState, useEffect, useRef, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import {
  Mic,
  Store,
  BarChart3,
  Package,
  Truck,
  BookOpen,
  Settings,
  Bell,
  User,
  Globe,
  ChevronDown,
  Menu,
  X,
  AlertTriangle,
  ShieldCheck,
  AudioWaveform,
} from 'lucide-react';
import type {
  NavTab,
  LanguageCode,
  DashboardSnapshot,
  ConversationMessage,
} from './types';
import { VoiceConsoleView } from './components/VoiceConsoleView';
import { SalesPosView } from './components/SalesPosView';
import { InventoryStockView } from './components/InventoryStockView';
import { SupplierOrdersView } from './components/SupplierOrdersView';
import { RemindersKhataView } from './components/RemindersKhataView';
import { SettingsDevicesView } from './components/SettingsDevicesView';

AgoraRTC.setLogLevel(4);

const NAV_ITEMS: { id: NavTab; label: string; sublabel: string; icon: typeof Mic }[] = [
  { id: 'voice', label: 'Voice Console', sublabel: 'ಅವಾಜ್ / आवाज AI', icon: Mic },
  { id: 'sales', label: 'Sales & POS', sublabel: 'ಮಾರಾಟ / बिक्री', icon: BarChart3 },
  { id: 'inventory', label: 'Inventory & Stock', sublabel: 'ದಾಸ್ತಾನು / स्टॉक', icon: Package },
  { id: 'suppliers', label: 'Supplier Orders', sublabel: 'ಖರೀದಿ / खरीद आदेश', icon: Truck },
  { id: 'reminders', label: 'Reminders & Khata', sublabel: 'ಜ್ಞಾಪನೆ / उधारी खाता', icon: BookOpen },
  { id: 'settings', label: 'Settings & Devices', sublabel: 'ಸೆಟ್ಟಿಂಗ್ಸ್ / सेटिंग्स', icon: Settings },
];

const INITIAL_MESSAGES: ConversationMessage[] = [
  {
    id: 'seed-user-1',
    role: 'user',
    speakerLabel: 'Suresh (Owner)',
    languageTag: 'Hindi/English Mixed',
    timestamp: '10:42:15 AM',
    text: 'How much sugar is left and which supplier has the best rate?',
    subText: 'चीनी कितनी बची है और किस सप्लायर का सबसे अच्छा रेट है?',
  },
  {
    id: 'seed-ai-1',
    role: 'assistant',
    speakerLabel: 'Vaani AI Engine',
    languageTag: 'Synthesized',
    timestamp: '10:42:17 AM',
    text: 'You currently have 12 kg of Madhur Sugar (50kg bag), below your safety threshold of 20 kg. Sri Ganesh Traders has the best price at ₹ 38/kg with delivery tomorrow morning.',
    subText: 'Should I draft a purchase order for 2 bags (100 kg) for ₹ 3,800?',
    suggestionAction: {
      label: 'Draft Purchase Order (₹ 3,800)',
      secondaryLabel: 'Compare 3 Suppliers',
      supplierId: 1,
      productId: 2,
      quantity: 100,
    },
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('voice');
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>(INITIAL_MESSAGES);
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAlertsDrawer, setShowAlertsDrawer] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'success' | 'error' } | null>(null);

  // Voice & Audio Engine State
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastLatencyMs, setLastLatencyMs] = useState(142);
  const [selectedMicId, setSelectedMicId] = useState('');

  // Agora RTC Live State
  const [agoraConnected, setAgoraConnected] = useState(false);
  const [agoraSessionId, setAgoraSessionId] = useState<string | null>(null);
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const agoraTrackRef = useRef<IMicrophoneAudioTrack | null>(null);

  // Recording / ASR / Playback Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafLevelRef = useRef<number>(0);
  const speechRecRef = useRef<any>(null);
  const speechTranscriptRef = useRef<string>('');
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const spaceHeldRef = useRef(false);

  const showToast = useCallback((text: string, tone: 'info' | 'success' | 'error' = 'info') => {
    setToast({ text, tone });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data = (await res.json()) as DashboardSnapshot;
        setSnapshot(data);
        if (data.profile?.preferred_language) {
          setLanguage(data.profile.preferred_language);
        }
      }
    } catch {
      // Initial poll failure handled silently
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const playBase64Audio = useCallback(
    (base64: string, mimeType: string) => {
      try {
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current = null;
        }
        const audio = new Audio(`data:${mimeType};base64,${base64}`);
        currentAudioRef.current = audio;
        setIsSpeaking(true);
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => setIsSpeaking(false);
        audio.play().catch(() => setIsSpeaking(false));
      } catch {
        setIsSpeaking(false);
      }
    },
    []
  );

  const playTextWithTTS = useCallback(
    async (text: string) => {
      try {
        setIsSpeaking(true);
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, language }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showToast(err.error || 'Voice synthesis unavailable', 'error');
          setIsSpeaking(false);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
        }
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } catch {
        setIsSpeaking(false);
      }
    },
    [language, showToast]
  );

  const handlePlayMessageAudio = useCallback(
    (msg: ConversationMessage) => {
      if (msg.audioBase64 && msg.audioMimeType) {
        playBase64Audio(msg.audioBase64, msg.audioMimeType);
      } else {
        playTextWithTTS(msg.text);
      }
    },
    [playBase64Audio, playTextWithTTS]
  );

  const sendVoiceTurn = useCallback(
    async (payload: { utterance?: string; audioBase64?: string; mimeType?: string }) => {
      setIsProcessing(true);
      const userTempId = `u-${Date.now()}`;
      const timeNow = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      if (payload.utterance) {
        setMessages((prev) => [
          ...prev,
          {
            id: userTempId,
            role: 'user',
            speakerLabel: `${snapshot?.profile?.owner_name || 'Suresh'} (Owner)`,
            languageTag: language === 'hi' ? 'Hindi/Hinglish' : language === 'kn' ? 'Kannada/Kanglish' : 'Multilingual',
            timestamp: timeNow,
            text: payload.utterance!,
          },
        ]);
      }

      try {
        const history = messages.slice(-4).map((m) => ({
          role: m.role,
          text: m.text,
        }));

        const res = await fetch('/api/voice/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            language,
            sessionId: agoraSessionId || 'browser-ptt',
            synthesizeAudio: true,
            history,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Voice agent could not process request', 'error');
          return;
        }

        if (!payload.utterance && data.utterance) {
          setMessages((prev) => [
            ...prev,
            {
              id: userTempId,
              role: 'user',
              speakerLabel: `${snapshot?.profile?.owner_name || 'Suresh'} (Owner)`,
              languageTag: data.detectedLanguage || 'Voice',
              timestamp: timeNow,
              text: data.utterance,
            },
          ]);
        }

        const aiTime = new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            speakerLabel: 'Vaani AI Engine',
            languageTag: data.ttsProvider === 'murf-falcon' ? 'Murf Falcon • en-IN-anisha' : 'Synthesized',
            timestamp: aiTime,
            text: data.replyText,
            ttsProvider: data.ttsProvider,
            audioBase64: data.audioBase64,
            audioMimeType: data.audioMimeType,
          },
        ]);

        if (data.latencyMs) setLastLatencyMs(data.latencyMs);
        if (data.snapshot) setSnapshot(data.snapshot);

        if (data.audioBase64 && data.audioMimeType) {
          playBase64Audio(data.audioBase64, data.audioMimeType);
        } else if (data.ttsError) {
          showToast(`Reply ready (${data.ttsError})`, 'info');
        }
      } catch {
        showToast('Network error reaching VaaniBiz voice server', 'error');
      } finally {
        setIsProcessing(false);
      }
    },
    [agoraSessionId, language, messages, playBase64Audio, showToast, snapshot?.profile?.owner_name]
  );

  // Stop Microphone Recording & Dispatch to Voice Turn
  const stopListening = useCallback(() => {
    setIsListening(false);
    setAudioLevel(0);
    if (rafLevelRef.current) cancelAnimationFrame(rafLevelRef.current);

    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Start Microphone Capture (MediaRecorder + AnalyserNode + optional Web Speech transcript)
  const startListening = useCallback(async () => {
    if (isListening || isProcessing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      });
      mediaStreamRef.current = stream;
      setIsListening(true);
      speechTranscriptRef.current = '';

      // Live audio level meter for waveform
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArr = new Uint8Array(analyser.frequencyBinCount);

      const tickLevel = () => {
        analyser.getByteFrequencyData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
        const avg = sum / dataArr.length / 255;
        setAudioLevel(Math.min(1, avg * 2.6));
        rafLevelRef.current = requestAnimationFrame(tickLevel);
      };
      rafLevelRef.current = requestAnimationFrame(tickLevel);

      // Optional browser speech recognition for ultra-fast transcript alongside raw audio fallback
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = language === 'hi' ? 'hi-IN' : language === 'kn' ? 'kn-IN' : 'en-IN';
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (event: any) => {
            let text = '';
            for (let i = 0; i < event.results.length; i++) {
              text += event.results[i][0].transcript + ' ';
            }
            speechTranscriptRef.current = text.trim();
          };
          rec.start();
          speechRecRef.current = rec;
        } catch {
          speechRecRef.current = null;
        }
      }

      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }

        const transcript = speechTranscriptRef.current.trim();
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });

        if (transcript.length > 1) {
          await sendVoiceTurn({ utterance: transcript });
        } else if (blob.size > 1500) {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const dataUrl = String(reader.result || '');
            const base64 = dataUrl.split(',')[1] || '';
            if (base64) {
              await sendVoiceTurn({ audioBase64: base64, mimeType: blob.type || 'audio/webm' });
            }
          };
          reader.readAsDataURL(blob);
        } else {
          showToast('No speech detected. Hold Spacebar and speak clearly.', 'info');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      setIsListening(false);
      showToast('Microphone permission denied or unavailable. You can also type commands below.', 'error');
    }
  }, [isListening, isProcessing, language, selectedMicId, sendVoiceTurn, showToast]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  // Global Push-to-Talk Spacebar Listener
  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isInputFocused()) {
        e.preventDefault();
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true;
          startListening();
        }
      }
      if (e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        setActiveTab('voice');
        toggleListening();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = false;
        stopListening();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [startListening, stopListening, toggleListening]);

  // Toggle Real Agora RTC Voice Channel
  const toggleAgoraConnection = async () => {
    if (agoraConnected) {
      try {
        if (agoraTrackRef.current) {
          agoraTrackRef.current.stop();
          agoraTrackRef.current.close();
          agoraTrackRef.current = null;
        }
        if (agoraClientRef.current) {
          await agoraClientRef.current.leave();
          agoraClientRef.current = null;
        }
        if (agoraSessionId) {
          await fetch('/api/agent/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: agoraSessionId }),
          });
        }
      } finally {
        setAgoraConnected(false);
        setAgoraSessionId(null);
        showToast('Disconnected from Agora RTC Voice Channel', 'info');
      }
      return;
    }

    try {
      const res = await fetch('/api/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not start Agora RTC session', 'error');
        return;
      }

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      agoraClientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
      });

      await client.join(data.appId, data.channel, data.token, data.uid);
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack(
        selectedMicId ? { microphoneId: selectedMicId } : undefined
      );
      agoraTrackRef.current = micTrack;
      await client.publish([micTrack]);

      setAgoraConnected(true);
      setAgoraSessionId(data.sessionId);
      setLastLatencyMs(data.latencyMs || 142);
      showToast(data.convoAiNote || `Connected to Agora Channel #${data.channel}`, 'success');
      fetchSnapshot();
    } catch (err: any) {
      showToast(err?.message || 'Agora RTC join failed (check mic permission or Secrets)', 'error');
    }
  };

  // Business Mutation Handlers
  const handleConfirmApproval = async (approvalId: string) => {
    const res = await fetch(`/api/approvals/${approvalId}/confirm`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Approval failed', 'error');
      return;
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast('Voice Guard approved & purchase order dispatched!', 'success');
  };

  const handleCancelApproval = async (approvalId: string) => {
    const res = await fetch(`/api/approvals/${approvalId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.snapshot) {
      setSnapshot(data.snapshot);
      showToast('Pending approval cancelled', 'info');
    }
  };

  const handleDraftPO = async (supplierId = 1, productId = 2, quantity = 100) => {
    const res = await fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier_id: supplierId, product_id: productId, quantity }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to draft PO', 'error');
      return;
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(`Drafted ${data.poNumber} (₹${data.totalAmount.toLocaleString('en-IN')}) — awaiting Voice Guard approval`, 'success');
  };

  const handleAutoDraftLow = async () => {
    const res = await fetch('/api/purchase-orders/auto-draft-low', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.snapshot) {
      setSnapshot(data.snapshot);
      showToast(`Auto-drafted ${data.count} purchase orders with best suppliers`, 'success');
      setActiveTab('suppliers');
    }
  };

  const handleReceivePO = async (poId: number) => {
    const res = await fetch(`/api/purchase-orders/${poId}/receive`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.snapshot) {
      setSnapshot(data.snapshot);
      showToast('PO marked received — inventory stock synced atomically!', 'success');
    }
  };

  const handleCreateSale = async (payload: {
    customer_name: string;
    payment_mode: string;
    items: { product_id: number; quantity: number }[];
  }) => {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Sale failed', 'error');
      return;
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(`Bill ${data.billNo} recorded & inventory updated`, 'success');
  };

  const handleAddProduct = async (payload: any) => {
    const res = await fetch('/api/inventory/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.snapshot) {
      setSnapshot(data.snapshot);
      showToast('Product SKU added to store inventory', 'success');
    }
  };

  const handleAdjustStock = async (productId: number, delta: number, reason: string) => {
    const res = await fetch('/api/inventory/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, delta, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Stock adjustment rejected', 'error');
      return;
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast('Stock movement logged in ledger', 'success');
  };

  const handleCollectKhata = async (customerId: number, amount: number) => {
    const res = await fetch(`/api/khata/${customerId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    if (res.ok && data.snapshot) {
      setSnapshot(data.snapshot);
      showToast(`Collected ₹${amount} and updated Khata balance`, 'success');
    }
  };

  const handleCreateReminder = async (payload: any) => {
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.snapshot) {
      setSnapshot(data.snapshot);
      showToast('Reminder scheduled', 'success');
    }
  };

  const handleReminderAction = async (id: number, action: 'complete' | 'snooze') => {
    const res = await fetch(`/api/reminders/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (res.ok && data.snapshot) {
      setSnapshot(data.snapshot);
      showToast(action === 'complete' ? 'Reminder completed' : 'Snoozed for 24h', 'info');
    }
  };

  const handleUpdateProfile = async (payload: any) => {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setLanguage(payload.preferred_language);
      await fetchSnapshot();
      showToast('Store preferences saved', 'success');
    }
  };

  const handleRunHealthCheck = async () => {
    const res = await fetch('/api/health/verify', { method: 'POST' });
    if (res.ok) {
      await fetchSnapshot();
      showToast('Live integration health check complete', 'success');
    }
  };

  const triggerVoiceFromTab = async (prompt: string) => {
    setActiveTab('voice');
    await sendVoiceTurn({ utterance: prompt });
  };

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-2xl bg-[#141B2D] text-[#F5D061] flex items-center justify-center mx-auto">
            <AudioWaveform className="w-5 h-5 animate-pulse" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Loading VaaniBiz Merchant Voice OS...</p>
        </div>
      </div>
    );
  }

  const alertCount = snapshot.lowStockItems.length + snapshot.pendingApprovals.length;

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col lg:flex-row text-slate-900">
      {/* Left Sidebar (Desktop Fixed + Mobile Drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[248px] bg-white border-r border-slate-200/80 flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Lockup */}
          <div className="px-5 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#141B2D] text-[#F5D061] flex items-center justify-center shrink-0">
                <AudioWaveform className="w-5 h-5" />
              </div>
              <div>
                <div className="font-display text-lg font-extrabold tracking-tight leading-none">
                  <span className="text-slate-900">Vaani</span>{' '}
                  <span className="text-[#D97706]">Biz</span>
                </div>
                <div className="text-[9px] font-bold tracking-[0.14em] uppercase text-slate-400 mt-1">
                  Merchant Voice OS
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Operations Portal Nav */}
          <div className="px-3.5 mt-2">
            <div className="px-3 mb-2 text-[10px] font-bold tracking-[0.12em] uppercase text-slate-400">
              Operations Portal
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors ${
                      isActive
                        ? 'bg-[#141B2D] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-[#F5D061]' : 'text-slate-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold leading-tight truncate">{item.label}</div>
                      <div
                        className={`text-[10px] mt-0.5 truncate ${
                          isActive ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {item.sublabel}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Audio Engine Status Card */}
        <div className="p-3.5">
          <div className="p-3.5 rounded-2xl bg-[#F4F7FC] border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
              <span className="text-slate-500">Audio Engine</span>
              <span className="inline-flex items-center gap-1 text-amber-800">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {agoraConnected ? 'RTC Live' : 'Online'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              Agora RTC • Gemini 4 • Murf Falcon Engine
            </p>
            <div className="pt-1 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-mono tabular-nums">
                Latency: <strong className="text-slate-800">{lastLatencyMs}ms</strong>
              </span>
              <span className="font-semibold text-amber-800">Healthy</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Global Top Header Bar */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200/80 px-4 sm:px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700"
                aria-label="Open menu"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Store Identity Pill */}
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-slate-100 border border-slate-200/80 text-left transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-700 shrink-0">
                  <Store className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 leading-tight">
                    {snapshot.profile.shop_name}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-tight">
                    Store {snapshot.profile.store_code} • {snapshot.profile.location}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
              </button>

              {/* Agora RTC Live Pill */}
              <button
                type="button"
                onClick={toggleAgoraConnection}
                className={`hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap ${
                  agoraConnected
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-[#F8FAFC] hover:bg-slate-100 border-slate-200/80 text-slate-700'
                }`}
                title="Click to connect/disconnect live Agora RTC channel"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    agoraConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                <span className="tabular-nums">
                  {agoraConnected ? 'Agora RTC Connected' : 'Agora RTC Live • 3.2 kbps'}
                </span>
              </button>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2.5">
              {/* Press Space to Speak CTA */}
              <button
                type="button"
                onClick={toggleListening}
                className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-all whitespace-nowrap ${
                  isListening
                    ? 'bg-rose-500 text-white ring-2 ring-rose-300'
                    : 'bg-[#F7DC88] hover:bg-[#F3D16A] text-slate-950'
                }`}
              >
                <Mic className={`w-3.5 h-3.5 ${isListening ? 'animate-pulse' : ''}`} />
                <span>{isListening ? 'Listening... Tap to Send' : 'Press Space to Speak'}</span>
                <kbd
                  className={`hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    isListening
                      ? 'bg-rose-700 text-white'
                      : 'bg-[#EED072] border border-amber-500/30 text-slate-800'
                  }`}
                >
                  Space
                </kbd>
              </button>

              {/* Language Switcher */}
              <div className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-slate-200/80 text-xs font-medium text-slate-700">
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                  className="bg-transparent focus:outline-none font-medium"
                  aria-label="Voice Language"
                >
                  <option value="en">English (EN)</option>
                  <option value="hi">हिन्दी (HI)</option>
                  <option value="kn">ಕನ್ನಡ (KN)</option>
                </select>
              </div>

              {/* Alerts Bell */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAlertsDrawer((v) => !v)}
                  className="relative p-2 rounded-xl bg-[#F8FAFC] hover:bg-slate-100 border border-slate-200/80 text-slate-700"
                  aria-label="Store alerts"
                >
                  <Bell className="w-4 h-4" />
                  {alertCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                      {alertCount}
                    </span>
                  )}
                </button>

                {showAlertsDrawer && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 z-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs font-bold text-slate-900">
                        Active Store Alerts ({alertCount})
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAlertsDrawer(false)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {snapshot.pendingApprovals.map((appr) => (
                      <button
                        key={appr.id}
                        type="button"
                        onClick={() => {
                          setActiveTab('suppliers');
                          setShowAlertsDrawer(false);
                        }}
                        className="w-full text-left p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1"
                      >
                        <div className="font-bold text-amber-900 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5" /> Voice Guard Approval
                        </div>
                        <div className="text-slate-700">{appr.summary}</div>
                      </button>
                    ))}
                    {snapshot.lowStockItems.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab('inventory');
                          setShowAlertsDrawer(false);
                        }}
                        className="w-full text-left p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs flex items-center justify-between"
                      >
                        <span className="font-medium text-rose-900 flex items-center gap-1.5 truncate">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {item.name}
                        </span>
                        <span className="font-mono font-bold text-rose-700 shrink-0 ml-2">
                          {item.stock_qty} {item.unit}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Merchant Profile Avatar */}
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="w-8 h-8 rounded-full bg-[#141B2D] text-white flex items-center justify-center hover:bg-slate-800 transition-colors"
                title={`${snapshot.profile.owner_name} • ${snapshot.profile.shop_name}`}
              >
                <User className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'voice' && (
            <VoiceConsoleView
              snapshot={snapshot}
              messages={messages}
              isListening={isListening}
              isProcessing={isProcessing}
              isSpeaking={isSpeaking}
              audioLevel={audioLevel}
              lastLatencyMs={lastLatencyMs}
              agoraConnected={agoraConnected}
              onToggleListening={toggleListening}
              onSendCommand={(text) => sendVoiceTurn({ utterance: text })}
              onPlayAudio={handlePlayMessageAudio}
              onDraftPoFromSuggestion={handleDraftPO}
              onConfirmApproval={handleConfirmApproval}
              onCancelApproval={handleCancelApproval}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'sales' && (
            <SalesPosView
              snapshot={snapshot}
              onCreateSale={handleCreateSale}
              onPlayTranscriptAudio={playTextWithTTS}
              onNavigate={setActiveTab}
              onTriggerVoicePrompt={triggerVoiceFromTab}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryStockView
              snapshot={snapshot}
              onAutoDraftLowStock={handleAutoDraftLow}
              onDraftPO={handleDraftPO}
              onAddProduct={handleAddProduct}
              onAdjustStock={handleAdjustStock}
              onTriggerVoicePrompt={triggerVoiceFromTab}
            />
          )}

          {activeTab === 'suppliers' && (
            <SupplierOrdersView
              snapshot={snapshot}
              onConfirmApproval={handleConfirmApproval}
              onCancelApproval={handleCancelApproval}
              onDraftPO={handleDraftPO}
              onReceivePO={handleReceivePO}
              onTriggerVoicePrompt={triggerVoiceFromTab}
            />
          )}

          {activeTab === 'reminders' && (
            <RemindersKhataView
              snapshot={snapshot}
              onCollectKhata={handleCollectKhata}
              onCreateReminder={handleCreateReminder}
              onReminderAction={handleReminderAction}
              onTriggerVoicePrompt={triggerVoiceFromTab}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsDevicesView
              snapshot={snapshot}
              selectedMicId={selectedMicId}
              onSelectMicId={setSelectedMicId}
              onUpdateProfile={handleUpdateProfile}
              onTestMurfVoice={() =>
                playTextWithTTS(
                  `Namaskara ${snapshot.profile.owner_name}! VaaniBiz Murf Falcon voice engine is ready at ${snapshot.profile.shop_name}.`
                )
              }
              onRunHealthCheck={handleRunHealthCheck}
            />
          )}
        </main>
      </div>

      {/* Non-blocking Toast Banner */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg border text-xs font-medium flex items-center gap-2.5 ${
            toast.tone === 'error'
              ? 'bg-rose-950 text-rose-100 border-rose-800'
              : toast.tone === 'success'
              ? 'bg-[#0B1120] text-[#FDE047] border-slate-700'
              : 'bg-[#0B1120] text-slate-100 border-slate-700'
          }`}
        >
          <span className="flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="opacity-70 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
