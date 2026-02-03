import React, { useState, useRef, useEffect } from 'react';
import './App.css';

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
  const [dbHistory, setDbHistory] = useState([]);
  const [showDbHistory, setShowDbHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  // Backend URL - LOCAL बैकएंड use करो
  const BACKEND_URL = 'https://speech-backend-henna.vercel.app'; // ये local backend URL है
  const API_BASE_URL = `${BACKEND_URL}/api/speech`;

  // ========== DATABASE HISTORY FETCH ==========
  const fetchDatabaseHistory = async () => {
    setIsLoadingHistory(true);
    setStatus('Loading database history...');
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/transcriptions?limit=20`);
      const data = await response.json();
      
      console.log('Database response:', data);
      
      if (data.success && data.data) {
        setDbHistory(data.data);
        setStatus(`Loaded ${data.data.length} records from database`);
      } else if (data.success === false) {
        setStatus('Database error: ' + (data.error || 'Unknown error'));
        setDbHistory([]);
      } else {
        setStatus('No database records found');
        setDbHistory([]);
      }
    } catch (error) {
      console.error('Failed to fetch database history:', error);
      setStatus('Failed to load database history - Check backend connection');
      setDbHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Load database history on component mount
  useEffect(() => {
    fetchDatabaseHistory();
  }, []);

  // ========== START RECORDING ==========
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

      console.log('Sending transcription request...');
      
      const response = await fetch(`${API_BASE_URL}/live`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      console.log('Transcription response:', data);
      
      if (data.success && data.text) {
        setTranscribedText(data.text);
        setStatus('✅ Transcription completed successfully');
        
        // Add to local history
        const newEntry = {
          id: Date.now(),
          text: data.text.substring(0, 100) + '...',
          fullText: data.text,
          time: new Date().toLocaleTimeString(),
          duration: recordingTime,
          type: 'recording',
          savedToDb: data.database?.success || false,
          dbId: data.database?.data?.id || null
        };
        setHistory(prev => [newEntry, ...prev.slice(0, 9)]);
        
        // Refresh database history if saved to DB
        if (data.database?.success) {
          setStatus('✅ Saved to database. Refreshing history...');
          setTimeout(() => fetchDatabaseHistory(), 1000);
        } else if (data.database?.error) {
          setStatus(`Database error: ${data.database.error}`);
        }
        
      } else if (data.text) {
        setTranscribedText(data.text);
        setStatus('Text processed');
      } else {
        setTranscribedText('Unable to generate transcription: ' + (data.error || 'Unknown error'));
        setStatus('Processing failed');
      }

    } catch (error) {
      console.error('Transcription error:', error);
      setTranscribedText(`Network error: ${error.message}`);
      setStatus('Connection issue detected - Make sure backend is running');
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

      console.log('Uploading file for transcription...');
      
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      console.log('File transcription response:', data);
      
      if (data.success && data.text) {
        setTranscribedText(data.text);
        setStatus('✅ File transcription completed');
        
        // Add to local history
        const newEntry = {
          id: Date.now(),
          text: data.text.substring(0, 100) + '...',
          fullText: data.text,
          time: new Date().toLocaleTimeString(),
          fileName: selectedFile.name,
          type: 'file',
          savedToDb: data.database?.success || false,
          dbId: data.database?.data?.id || null
        };
        setHistory(prev => [newEntry, ...prev.slice(0, 9)]);
        
        // Refresh database history if saved to DB
        if (data.database?.success) {
          setStatus('✅ Saved to database. Refreshing history...');
          setTimeout(() => fetchDatabaseHistory(), 1000);
        } else if (data.database?.error) {
          setStatus(`Database error: ${data.database.error}`);
        }
      } else {
        setTranscribedText('File processing failed: ' + (data.error || 'Unknown error'));
        setStatus('Unable to process file');
      }

    } catch (error) {
      console.error('File upload error:', error);
      setTranscribedText(`Upload error: ${error.message}`);
      setStatus('File upload failed - Check backend connection');
    } finally {
      setIsLoading(false);
    }
  };

  // ========== LOAD FROM DATABASE ==========
  const loadFromDatabase = (dbItem) => {
    setTranscribedText(dbItem.text);
    setStatus(`Loaded from database (ID: ${dbItem.id})`);
    
    // Scroll to text area
    setTimeout(() => {
      const textArea = document.querySelector('.transcription-area');
      if (textArea) {
        textArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // ========== DELETE FROM DATABASE ==========
  const deleteFromDatabase = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transcription?')) {
      return;
    }

    setStatus('Deleting from database...');
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/transcriptions/${id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus('✅ Transcription deleted');
        // Remove from local state
        setDbHistory(prev => prev.filter(item => item.id !== id));
        
        // Show success message
        setTimeout(() => {
          setStatus('Ready');
        }, 2000);
      } else {
        setStatus('Failed to delete: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Delete error:', error);
      setStatus('Delete failed - Check backend connection');
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const viewHistoryItem = (item) => {
    setTranscribedText(item.fullText);
    setStatus(`Loaded from ${item.time}`);
  };

  // ========== DATABASE HISTORY MODAL ==========
  const DatabaseHistoryModal = () => (
    <div className="modal-overlay" onClick={() => setShowDbHistory(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="database-card">
          <div className="card-header">
            <h3>🗄️ Database History</h3>
            <div className="modal-actions">
              <button 
                className="action-btn refresh-btn"
                onClick={fetchDatabaseHistory}
                disabled={isLoadingHistory}
              >
                {isLoadingHistory ? 'Loading...' : '🔄 Refresh'}
              </button>
              <button 
                className="action-btn close-btn"
                onClick={() => setShowDbHistory(false)}
              >
                ✕ Close
              </button>
            </div>
          </div>
          
          {isLoadingHistory ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading database records...</p>
            </div>
          ) : dbHistory.length === 0 ? (
            <div className="empty-db">
              <p>No records in database yet.</p>
              <p>Start transcribing to save records!</p>
            </div>
          ) : (
            <div className="db-history-list">
              {dbHistory.map(item => (
                <div key={item.id} className="db-history-item">
                  <div className="db-item-content">
                    <div className="db-item-header">
                      <span className="db-item-type">
                        {item.transcription_type === 'live' ? '🎤 Live' : '📁 File'}
                      </span>
                      <span className="db-item-id">ID: {item.id}</span>
                      <span className="db-item-date">{formatDate(item.created_at)}</span>
                    </div>
                    <p className="db-item-text">
                      {item.text.substring(0, 150)}...
                    </p>
                    <div className="db-item-meta">
                      <span>Language: {item.language}</span>
                      <span>Words: {item.word_count || 0}</span>
                      <span>Size: {item.audio_size ? (item.audio_size / (1024 * 1024)).toFixed(2) + ' MB' : 'N/A'}</span>
                      {item.confidence && (
                        <span>Confidence: {(item.confidence * 100).toFixed(1)}%</span>
                      )}
                    </div>
                  </div>
                  <div className="db-item-actions">
                    <button 
                      className="db-action-btn load-btn"
                      onClick={() => loadFromDatabase(item)}
                      title="Load this transcription"
                    >
                      📝 Load
                    </button>
                    <button 
                      className="db-action-btn delete-btn"
                      onClick={() => deleteFromDatabase(item.id)}
                      title="Delete from database"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>🎤 VoiceText Pro</h1>
        <p className="subtitle">Speech to Text with Supabase Database</p>
        
        <div className="header-controls">
          <div className="api-status">
            <span className="status connected">Backend: {BACKEND_URL}</span>
            <span className="current-status">{status}</span>
          </div>
          
          <button 
            className="db-toggle-btn"
            onClick={() => setShowDbHistory(true)}
            title="View database history"
          >
            🗄️ Database ({dbHistory.length})
          </button>
        </div>
      </header>

      {/* Database History Modal */}
      {showDbHistory && <DatabaseHistoryModal />}

      <div className="container">
        {/* Left Panel - Controls */}
        <div className="left-panel">
          {/* Language Selection */}
          <div className="card">
            <h3>🌐 Language Settings</h3>
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isLoading || isRecording}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese</option>
            </select>
            <p className="card-hint">Select language for accurate transcription</p>
          </div>

          {/* File Upload */}
          <div className="card">
            <h3>📁 Upload Audio</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.webm,.ogg"
              onChange={handleFileSelect}
              disabled={isLoading || isRecording}
              style={{ display: 'none' }}
            />
            
            <button 
              className="btn select-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isRecording}
            >
              📂 Browse Files
            </button>
            
            {selectedFile && (
              <div className="file-info">
                <div className="file-preview">
                  <div className="file-icon">📄</div>
                  <div className="file-details">
                    <p className="file-name">{selectedFile.name}</p>
                    <p className="file-size">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {selectedFile && (
              <button 
                className="btn upload-btn"
                onClick={transcribeFile}
                disabled={isLoading || isRecording}
              >
                {isLoading ? (
                  <>
                    <span className="spinner"></span>
                    Processing...
                  </>
                ) : (
                  'Transcribe File'
                )}
              </button>
            )}
          </div>

          {/* Voice Recording */}
          <div className="card">
            <h3>🎤 Voice Recording</h3>
            
            <button 
              className={`btn record-btn ${isRecording ? 'recording' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading}
            >
              {isRecording ? (
                <>
                  <span className="recording-indicator"></span>
                  Stop Recording ({formatTime(recordingTime)})
                </>
              ) : (
                'Start Recording'
              )}
            </button>

            {audioUrl && !isRecording && (
              <div className="recording-controls">
                <audio 
                  controls 
                  src={audioUrl} 
                  className="audio-player"
                />
                <button 
                  className="btn process-btn"
                  onClick={transcribeRecording}
                  disabled={isLoading}
                >
                  {isLoading ? 'Transcribing...' : 'Convert to Text'}
                </button>
              </div>
            )}
            
            <div className="tips">
              <p className="tips-title">🎯 Tips for best results:</p>
              <ul className="tips-list">
                <li>Speak clearly at normal pace</li>
                <li>Reduce background noise</li>
                <li>Record in a quiet environment</li>
                <li>Keep recordings under 2 minutes</li>
              </ul>
            </div>
          </div>

          {/* Recent Local History */}
          {history.length > 0 && (
            <div className="card">
              <h3>📋 Recent Transcriptions</h3>
              <div className="history-list">
                {history.map(item => (
                  <div 
                    key={item.id} 
                    className="history-item"
                    onClick={() => viewHistoryItem(item)}
                  >
                    <div className="history-icon">
                      {item.type === 'recording' ? '🎤' : '📁'}
                    </div>
                    <div className="history-content">
                      <p className="history-text">{item.text}</p>
                      <p className="history-meta">
                        {item.time} • {item.type} • {item.duration ? `${item.duration}s` : ''}
                        {item.savedToDb && <span className="saved-badge"> ✅ Saved</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Results */}
        <div className="right-panel">
          {/* Transcription Result */}
          <div className="card">
            <div className="result-header">
              <h3>📄 Transcription Result</h3>
              {transcribedText && (
                <div className="actions">
                  <button 
                    className="action-btn"
                    onClick={copyToClipboard}
                    title="Copy to clipboard"
                  >
                    📋 Copy
                  </button>
                  <button 
                    className="action-btn"
                    onClick={downloadText}
                    title="Download as text file"
                  >
                    ⬇️ Download
                  </button>
                  <button 
                    className="action-btn clear-btn"
                    onClick={clearAll}
                    title="Clear all"
                  >
                    🗑️ Clear
                  </button>
                </div>
              )}
            </div>
            
            <div className="text-output">
              {transcribedText ? (
                <div className="text-area-wrapper">
                  <textarea 
                    value={transcribedText}
                    readOnly
                    className="transcription-area"
                    placeholder="Your transcribed text will appear here..."
                  />
                  <div className="text-stats">
                    <span className="stat-item">
                      <strong>Characters:</strong> {transcribedText.length}
                    </span>
                    <span className="statItem">
                      <strong>Words:</strong> {transcribedText.trim().split(/\s+/).length}
                    </span>
                    <span className="stat-item">
                      <strong>Lines:</strong> {transcribedText.split('\n').length}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="placeholder">
                  <div className="empty-icon">✍️</div>
                  <h3>No Transcription Yet</h3>
                  <p>
                    Record your voice or upload an audio file to begin.
                    Your text will appear here automatically.
                  </p>
                  <div className="empty-actions">
                    <button 
                      className="btn select-btn empty-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📁 Upload File
                    </button>
                    <button 
                      className="btn record-btn empty-btn"
                      onClick={startRecording}
                    >
                      🎤 Start Recording
                    </button>
                    <button 
                      className="btn test-btn empty-btn"
                      onClick={() => setShowDbHistory(true)}
                    >
                      🗄️ Load from Database
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Audio Preview */}
          {audioUrl && (
            <div className="card">
              <h3>🔊 Audio Preview</h3>
              <audio 
                controls 
                src={audioUrl} 
                className="audio-player"
              />
              <div className="preview-info">
                <p>
                  <strong>Duration:</strong> {formatTime(recordingTime)}
                  {selectedFile && ` • File: ${selectedFile.name}`}
                </p>
              </div>
            </div>
          )}

          {/* Database Info */}
          <div className="card info-card">
            <h3>🗄️ Database Information</h3>
            <p className="info-text">
              All transcriptions are automatically saved to Supabase database.
              Click the <strong>Database</strong> button to view, load, or delete transcriptions.
            </p>
            <div className="info-stats">
              <div className="info-stat">
                <span className="stat-number">{dbHistory.length}</span>
                <span className="stat-label">Total Records</span>
              </div>
              <div className="info-stat">
                <span className="stat-number">
                  {dbHistory.filter(item => item.transcription_type === 'live').length}
                </span>
                <span className="stat-label">Live Recordings</span>
              </div>
              <div className="info-stat">
                <span className="stat-number">
                  {dbHistory.filter(item => item.transcription_type === 'file_upload').length}
                </span>
                <span className="stat-label">File Uploads</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>© {new Date().getFullYear()} VoiceText Pro • Speech to Text with Supabase Database</p>
        <p className="footer-subtext">
          Backend: {BACKEND_URL} • Supports: MP3, WAV, M4A, WebM • Real-time transcription
        </p>
      </footer>
    </div>
  );
}

export default App;