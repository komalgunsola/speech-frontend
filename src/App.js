import React, { useState, useRef } from 'react';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [transcribedText, setTranscribedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [language, setLanguage] = useState('en');
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState('Ready');
  const [history, setHistory] = useState([]);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  const BACKEND_URL = 'https://speech-backend-henna.vercel.app';
  const API_BASE_URL = `${BACKEND_URL}/api/speech`;

  // ========== START RECORDING 
  const startRecording = async () => {
    try {
      setStatus('Initializing microphone...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];
      
      // Use optimal recording format
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      };
      
      let mediaRecorder;
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mediaRecorder = new MediaRecorder(stream, options);
      } else {
        mediaRecorder = new MediaRecorder(stream);
      }
      
      recorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length === 0) {
          setStatus('No audio detected');
          return;
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: 'audio/webm' 
        });
        
        const audioUrl = URL.createObjectURL(audioBlob);
        
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);
        setIsRecording(false);
        
        // Cleanup
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        
        setStatus('Recording processed successfully');
      };

      mediaRecorder.start(500);
      setIsRecording(true);
      setRecordingTime(0);
      setStatus('Recording... Speak clearly into microphone');

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Recording setup failed:', error);
      setStatus('Unable to access microphone');
      alert('Microphone access is required for recording. Please check browser permissions.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      setStatus('Finalizing recording...');
    }
  };

  // ========== TRANSCRIBE RECORDING ==========
  const transcribeRecording = async () => {
    if (!audioBlob) {
      alert('Please record audio first');
      return;
    }

    setIsLoading(true);
    setStatus('Converting speech to text...');

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice-recording.webm');
      formData.append('language', language);
      formData.append('duration', recordingTime.toString());

      const response = await fetch(`${API_BASE_URL}/live`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success && data.text) {
        setTranscribedText(data.text);
        setStatus('✅ Transcription completed successfully');
        
        // Add to history
        const newEntry = {
          id: Date.now(),
          text: data.text.substring(0, 100) + '...',
          fullText: data.text,
          time: new Date().toLocaleTimeString(),
          duration: recordingTime,
          type: 'recording'
        };
        setHistory(prev => [newEntry, ...prev.slice(0, 9)]);
        
      } else if (data.text) {
        setTranscribedText(data.text);
        setStatus('Text processed');
      } else {
        setTranscribedText('Unable to generate transcription');
        setStatus('Processing failed');
      }

    } catch (error) {
      console.error('Transcription error:', error);
      setTranscribedText(`Network error: ${error.message}`);
      setStatus('Connection issue detected');
    } finally {
      setIsLoading(false);
    }
  };

  // ========== UPLOAD & TRANSCRIBE FILE ==========
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setSelectedFile(file);
      
      // Validate file
      const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/x-m4a'];
      if (!validTypes.includes(file.type)) {
        alert('Please select an audio file (MP3, WAV, M4A, WebM)');
        return;
      }
      
      const fileUrl = URL.createObjectURL(file);
      setAudioUrl(fileUrl);
      setStatus(`File selected: ${file.name}`);
    }
  };

  const transcribeFile = async () => {
    if (!selectedFile) {
      alert('Please select an audio file first');
      return;
    }

    setIsLoading(true);
    setStatus('Processing audio file...');

    try {
      const formData = new FormData();
      formData.append('audio', selectedFile);
      formData.append('language', language);

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success && data.text) {
        setTranscribedText(data.text);
        setStatus('✅ File transcription completed');
        
        // Add to history
        const newEntry = {
          id: Date.now(),
          text: data.text.substring(0, 100) + '...',
          fullText: data.text,
          time: new Date().toLocaleTimeString(),
          fileName: selectedFile.name,
          type: 'file'
        };
        setHistory(prev => [newEntry, ...prev.slice(0, 9)]);
      } else {
        setTranscribedText('File processing failed');
        setStatus('Unable to process file');
      }

    } catch (error) {
      console.error('File upload error:', error);
      setTranscribedText(`Upload error: ${error.message}`);
      setStatus('File upload failed');
    } finally {
      setIsLoading(false);
    }
  };

  // ========== TEXT MANAGEMENT ==========
  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcribedText)
      .then(() => {
        setStatus('Text copied to clipboard');
        setTimeout(() => setStatus('Ready'), 2000);
      })
      .catch(() => alert('Copy failed - please try again'));
  };

  const downloadText = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `transcription-${timestamp}.txt`;
    
    const element = document.createElement('a');
    const file = new Blob([transcribedText], {type: 'text/plain;charset=utf-8'});
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    setStatus('Download started');
  };

  const clearAll = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (isRecording) stopRecording();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setAudioUrl('');
    setAudioBlob(null);
    setTranscribedText('');
    setSelectedFile(null);
    setRecordingTime(0);
    setStatus('Ready');
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const viewHistoryItem = (item) => {
    setTranscribedText(item.fullText);
    setStatus(`Loaded from ${item.time}`);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logoSection}>
            <div style={styles.logo}>🎤</div>
            <div>
              <h1 style={styles.title}>VoiceText Pro</h1>
              <p style={styles.subtitle}>Speech to Text Converter</p>
            </div>
          </div>
          <div style={styles.statusIndicator}>
            <div style={{
              ...styles.statusDot,
              backgroundColor: status.includes('✅') ? '#10b981' : 
                              status.includes('Unable') ? '#ef4444' : '#3b82f6'
            }}></div>
            <span style={styles.statusText}>{status}</span>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.grid}>
          {/* Left Panel - Controls */}
          <div style={styles.controlPanel}>
            {/* Language Selection */}
            <div style={styles.controlCard}>
              <div style={styles.cardHeader}>
                <span style={styles.cardIcon}>🌐</span>
                <h3 style={styles.cardTitle}>Language Settings</h3>
              </div>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isLoading || isRecording}
                style={styles.languageSelect}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
              <p style={styles.cardHint}>Select language for accurate transcription</p>
            </div>

            {/* File Upload */}
            <div style={styles.controlCard}>
              <div style={styles.cardHeader}>
                <span style={styles.cardIcon}>📁</span>
                <h3 style={styles.cardTitle}>Upload Audio</h3>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.webm"
                onChange={handleFileSelect}
                disabled={isLoading || isRecording}
                style={{ display: 'none' }}
              />
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isRecording}
                style={styles.uploadButton}
              >
                <span style={styles.buttonIcon}>📂</span>
                Browse Files
              </button>
              
              {selectedFile && (
                <div style={styles.filePreview}>
                  <div style={styles.fileIcon}>📄</div>
                  <div style={styles.fileDetails}>
                    <p style={styles.fileName}>{selectedFile.name}</p>
                    <p style={styles.fileSize}>
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              )}
              
              {selectedFile && (
                <button 
                  onClick={transcribeFile}
                  disabled={isLoading || isRecording}
                  style={styles.transcribeButton}
                >
                  {isLoading ? (
                    <>
                      <span style={styles.spinner}></span>
                      Processing...
                    </>
                  ) : (
                    'Transcribe File'
                  )}
                </button>
              )}
            </div>

            {/* Voice Recording */}
            <div style={styles.controlCard}>
              <div style={styles.cardHeader}>
                <span style={styles.cardIcon}>🎤</span>
                <h3 style={styles.cardTitle}>Voice Recording</h3>
              </div>
              
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                style={{
                  ...styles.recordButton,
                  ...(isRecording ? styles.recordingActive : {})
                }}
                disabled={isLoading}
              >
                {isRecording ? (
                  <>
                    <span style={styles.recordingIndicator}></span>
                    Stop Recording ({formatTime(recordingTime)})
                  </>
                ) : (
                  'Start Recording'
                )}
              </button>

              {audioUrl && !isRecording && (
                <div style={styles.recordingControls}>
                  <audio 
                    controls 
                    src={audioUrl} 
                    style={styles.audioPlayer}
                  />
                  <button 
                    onClick={transcribeRecording}
                    disabled={isLoading}
                    style={styles.processButton}
                  >
                    {isLoading ? 'Transcribing...' : 'Convert to Text'}
                  </button>
                </div>
              )}
              
              <div style={styles.tips}>
                <p style={styles.tipsTitle}>🎯 Tips for best results:</p>
                <ul style={styles.tipsList}>
                  <li>Speak clearly at normal pace</li>
                  <li>Reduce background noise</li>
                  <li>Record in a quiet environment</li>
                  <li>Keep recordings under 2 minutes</li>
                </ul>
              </div>
            </div>

            {/* Recent History */}
            {history.length > 0 && (
              <div style={styles.controlCard}>
                <div style={styles.cardHeader}>
                  <span style={styles.cardIcon}>📋</span>
                  <h3 style={styles.cardTitle}>Recent Transcriptions</h3>
                </div>
                <div style={styles.historyList}>
                  {history.map(item => (
                    <div 
                      key={item.id} 
                      style={styles.historyItem}
                      onClick={() => viewHistoryItem(item)}
                    >
                      <div style={styles.historyIcon}>
                        {item.type === 'recording' ? '🎤' : '📁'}
                      </div>
                      <div style={styles.historyContent}>
                        <p style={styles.historyText}>{item.text}</p>
                        <p style={styles.historyMeta}>
                          {item.time} • {item.type} • {item.duration ? `${item.duration}s` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Results */}
          <div style={styles.resultPanel}>
            <div style={styles.resultCard}>
              <div style={styles.resultHeader}>
                <h2 style={styles.resultTitle}>
                  <span style={styles.resultIcon}>📄</span>
                  Transcription Result
                </h2>
                {transcribedText && (
                  <div style={styles.resultActions}>
                    <button 
                      onClick={copyToClipboard}
                      style={styles.actionButton}
                      title="Copy to clipboard"
                    >
                      <span style={styles.actionIcon}>📋</span>
                      Copy
                    </button>
                    <button 
                      onClick={downloadText}
                      style={styles.actionButton}
                      title="Download as text file"
                    >
                      <span style={styles.actionIcon}>⬇️</span>
                      Download
                    </button>
                    <button 
                      onClick={clearAll}
                      style={{...styles.actionButton, ...styles.clearButton}}
                      title="Clear all"
                    >
                      <span style={styles.actionIcon}>🗑️</span>
                      Clear
                    </button>
                  </div>
                )}
              </div>
              
              <div style={styles.textContainer}>
                {transcribedText ? (
                  <div style={styles.textAreaWrapper}>
                    <textarea 
                      value={transcribedText}
                      readOnly
                      style={styles.textArea}
                      placeholder="Your transcribed text will appear here..."
                    />
                    <div style={styles.textStats}>
                      <span style={styles.statItem}>
                        <strong>Characters:</strong> {transcribedText.length}
                      </span>
                      <span style={styles.statItem}>
                        <strong>Words:</strong> {transcribedText.trim().split(/\s+/).length}
                      </span>
                      <span style={styles.statItem}>
                        <strong>Lines:</strong> {transcribedText.split('\n').length}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyIcon}>✍️</div>
                    <h3 style={styles.emptyTitle}>No Transcription Yet</h3>
                    <p style={styles.emptyText}>
                      Record your voice or upload an audio file to begin.
                      Your text will appear here automatically.
                    </p>
                    <div style={styles.emptyActions}>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        style={styles.emptyButton}
                      >
                        📁 Upload File
                      </button>
                      <button 
                        onClick={startRecording}
                        style={{...styles.emptyButton, ...styles.recordEmptyButton}}
                      >
                        🎤 Start Recording
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Audio Preview */}
            {audioUrl && (
              <div style={styles.previewCard}>
                <h3 style={styles.previewTitle}>
                  <span style={styles.previewIcon}>🔊</span>
                  Audio Preview
                </h3>
                <audio 
                  controls 
                  src={audioUrl} 
                  style={styles.previewPlayer}
                />
                <div style={styles.previewInfo}>
                  <p>
                    <strong>Duration:</strong> {formatTime(recordingTime)}
                    {selectedFile && ` • File: ${selectedFile.name}`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <p style={styles.footerText}>
            © {new Date().getFullYear()} VoiceText Pro • Speech to Text Converter
          </p>
          <p style={styles.footerSubtext}>
            Supports: MP3, WAV, M4A, WebM • Real-time transcription • Multiple languages
          </p>
        </div>
      </footer>
    </div>
  );
}

// Professional Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  
  // Header
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e2e8f0',
    padding: '20px 0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  headerContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '20px',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logo: {
    fontSize: '40px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
    width: '60px',
    height: '60px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: '0',
    lineHeight: '1.2',
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    margin: '4px 0 0',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#f1f5f9',
    padding: '8px 16px',
    borderRadius: '20px',
    border: '1px solid #e2e8f0',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '14px',
    color: '#475569',
    fontWeight: '500',
  },
  
  // Main Content
  main: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '30px 24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.8fr',
    gap: '30px',
  },
  
  // Control Panel
  controlPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  controlCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
    border: '1px solid #e2e8f0',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
  },
  cardIcon: {
    fontSize: '24px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0',
  },
  cardHint: {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '8px',
  },
  
  // Form Elements
  languageSelect: {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#334155',
    backgroundColor: 'white',
    transition: 'all 0.2s',
  },
  
  // Buttons
  uploadButton: {
    width: '100%',
    padding: '14px 20px',
    backgroundColor: '#f8fafc',
    border: '2px dashed #cbd5e1',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '500',
    color: '#475569',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  buttonIcon: {
    fontSize: '18px',
  },
  
  filePreview: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#f1f5f9',
    padding: '12px',
    borderRadius: '8px',
    marginTop: '16px',
    border: '1px solid #e2e8f0',
  },
  fileIcon: {
    fontSize: '20px',
    color: '#3b82f6',
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1e293b',
    margin: '0 0 ',
  },
  fileSize: {
    fontSize: '12px',
    color: '#64748b',
    margin: '4px 0 0',
  },
  
  transcribeButton: {
    width: '100%',
    padding: '14px 20px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  
  recordButton: {
    width: '100%',
    padding: '16px 20px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  recordingActive: {
    backgroundColor: '#dc2626',
    animation: 'pulse 1.5s infinite',
  },
  recordingIndicator: {
    width: '10px',
    height: '10px',
    backgroundColor: 'white',
    borderRadius: '50%',
    animation: 'blink 1s infinite',
  },
  
  recordingControls: {
    marginTop: '20px',
  },
  audioPlayer: {
    width: '100%',
    marginBottom: '16px',
    borderRadius: '8px',
  },
  processButton: {
    width: '100%',
    padding: '14px 20px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  
  // Tips
  tips: {
    backgroundColor: '#f0f9ff',
    padding: '16px',
    borderRadius: '10px',
    marginTop: '20px',
    border: '1px solid #bae6fd',
  },
  tipsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#0369a1',
    margin: '0 0 8px',
  },
  tipsList: {
    fontSize: '13px',
    color: '#0c4a6e',
    margin: '0',
    paddingLeft: '20px',
    lineHeight: '1.6',
  },
  
  // History
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  historyItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  historyIcon: {
    fontSize: '18px',
    color: '#3b82f6',
  },
  historyContent: {
    flex: 1,
  },
  historyText: {
    fontSize: '13px',
    color: '#334155',
    margin: '0 0 4px',
    lineHeight: '1.4',
  },
  historyMeta: {
    fontSize: '11px',
    color: '#64748b',
    margin: '0',
  },
  
  // Result Panel
  resultPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  resultCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '30px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
    border: '1px solid #e2e8f0',
    flex: 1,
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  resultTitle: {
    fontSize: '22px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  resultIcon: {
    fontSize: '24px',
  },
  resultActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  actionButton: {
    padding: '8px 16px',
    backgroundColor: '#f1f5f9',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#475569',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  actionIcon: {
    fontSize: '14px',
  },
  clearButton: {
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
    color: '#dc2626',
  },
  
  // Text Area
  textContainer: {
    minHeight: '500px',
  },
  textAreaWrapper: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  textArea: {
    flex: 1,
    width: '100%',
    padding: '20px',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: '15px',
    lineHeight: '1.6',
    color: '#334155',
    backgroundColor: '#f8fafc',
    resize: 'none',
    fontFamily: 'inherit',
    minHeight: '400px',
  },
  textStats: {
    display: 'flex',
    gap: '20px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e2e8f0',
  },
  statItem: {
    fontSize: '13px',
    color: '#64748b',
  },
  
  // Empty State
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '500px',
    textAlign: 'center',
    padding: '40px',
  },
  emptyIcon: {
    fontSize: '60px',
    marginBottom: '20px',
    opacity: '0.7',
  },
  emptyTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#475569',
    margin: '0 0 12px',
  },
  emptyText: {
    fontSize: '15px',
    color: '#64748b',
    lineHeight: '1.6',
    maxWidth: '400px',
    margin: '0 0 30px',
  },
  emptyActions: {
    display: 'flex',
    gap: '12px',
  },
  emptyButton: {
    padding: '12px 24px',
    backgroundColor: '#f1f5f9',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#475569',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  recordEmptyButton: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: 'white',
  },
  
  // Preview Card
  previewCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
    border: '1px solid #e2e8f0',
  },
  previewTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  previewIcon: {
    fontSize: '20px',
  },
  previewPlayer: {
    width: '100%',
    marginBottom: '12px',
    borderRadius: '8px',
  },
  previewInfo: {
    fontSize: '13px',
    color: '#64748b',
  },
  
  // Footer
  footer: {
    backgroundColor: '#1e293b',
    color: 'white',
    padding: '30px 0',
    marginTop: '40px',
  },
  footerContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 24px',
    textAlign: 'center',
  },
  footerText: {
    fontSize: '15px',
    fontWeight: '500',
    margin: '0 0 8px',
    color: '#cbd5e1',
  },
  footerSubtext: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: '0',
  },
  
  // Spinner
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderRadius: '50%',
    borderTopColor: 'white',
    animation: 'spin 1s linear infinite',
  },
};

// Add animations
const styleSheet = document.styleSheets[0];
styleSheet.insertRule(`
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
`, styleSheet.cssRules.length);

styleSheet.insertRule(`
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`, styleSheet.cssRules.length);

styleSheet.insertRule(`
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`, styleSheet.cssRules.length);

export default App;