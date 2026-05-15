import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Folder, FileText, Image, Film, Music, Archive, File,
  ChevronRight, Home, Upload, FolderPlus, Trash2, Copy,
  Scissors, ClipboardPaste, Download, RefreshCw, Search,
  LayoutGrid, List, X, Check, AlertCircle, Loader2,
  HardDrive, MoreVertical, ArrowUpDown, Eye
} from 'lucide-react';
import './App.css';

const API = '';

function getPassword() { return sessionStorage.getItem('sftp_pw') || ''; }
function savePassword(pw) { sessionStorage.setItem('sftp_pw', pw); }
function clearPassword() { sessionStorage.removeItem('sftp_pw'); }

function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), 'x-sftp-password': getPassword() },
  });
}

function LoginScreen({ onLogin }) {
  const [password, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      savePassword(password);
      const res = await apiFetch(`${API}/api/auth`);
      const data = await res.json();
      if (data.success) { onLogin(); }
      else { clearPassword(); setError('Password non valida. Riprova.'); }
    } catch (e) {
      clearPassword();
      setError('Errore di connessione al server.');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">
          <HardDrive size={32} style={{ color: 'var(--accent)' }} />
          <span>My Drive</span>
        </div>
        <p className="login-desc">Inserisci la password del tuo Storagebox per accedere.</p>
        <input
          className="modal-input" type="password" placeholder="Password Storagebox"
          value={password} onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()} autoFocus
        />
        {error && <div className="login-error"><AlertCircle size={13} />{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleLogin} disabled={loading}>
          {loading && <Loader2 size={15} className="spin" />}
          {loading ? 'Connessione...' : 'Accedi'}
        </button>
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FileIcon({ type, name, size = 18, className = '' }) {
  const ext = name?.split('.').pop()?.toLowerCase();
  const props = { size, className };
  if (type === 'directory') return <Folder {...props} style={{ color: 'var(--yellow)' }} />;
  if (type === 'image') return <Image {...props} style={{ color: 'var(--purple)' }} />;
  if (type === 'video') return <Film {...props} style={{ color: 'var(--accent)' }} />;
  if (type === 'audio') return <Music {...props} style={{ color: 'var(--green)' }} />;
  if (type === 'archive') return <Archive {...props} style={{ color: 'var(--orange)' }} />;
  if (type === 'document') {
    if (['pdf'].includes(ext)) return <FileText {...props} style={{ color: '#ef4444' }} />;
    if (['doc','docx'].includes(ext)) return <FileText {...props} style={{ color: '#3b82f6' }} />;
    if (['xls','xlsx'].includes(ext)) return <FileText {...props} style={{ color: 'var(--green)' }} />;
    return <FileText {...props} style={{ color: 'var(--text-muted)' }} />;
  }
  return <File {...props} style={{ color: 'var(--text-muted)' }} />;
}

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'error' ? <AlertCircle size={15} /> : t.type === 'loading' ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item.separator ? <div key={i} className="context-separator" /> :
        <button key={i} className={`context-item ${item.danger ? 'danger' : ''}`} onClick={() => { item.onClick(); onClose(); }}>
          {item.icon && <span className="context-icon">{item.icon}</span>}
          {item.label}
        </button>
      )}
    </div>
  );
}

function RenameModal({ file, onConfirm, onClose }) {
  const [name, setName] = useState(file.name);
  const inputRef = useRef();
  useEffect(() => { inputRef.current?.select(); }, []);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Rinomina</div>
        <input ref={inputRef} className="modal-input" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm(name); if (e.key === 'Escape') onClose(); }} />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={() => onConfirm(name)}>Rinomina</button>
        </div>
      </div>
    </div>
  );
}

function NewFolderModal({ onConfirm, onClose }) {
  const [name, setName] = useState('Nuova cartella');
  const inputRef = useRef();
  useEffect(() => { inputRef.current?.select(); }, []);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Nuova cartella</div>
        <input ref={inputRef} className="modal-input" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm(name); if (e.key === 'Escape') onClose(); }} />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={() => onConfirm(name)}>Crea</button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ files, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Elimina</div>
        <p className="modal-desc">
          {files.length === 1
            ? <>Eliminare <strong>{files[0].name}</strong>? L'operazione è irreversibile.</>
            : <>Eliminare <strong>{files.length} elementi</strong>? L'operazione è irreversibile.</>}
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-danger" onClick={onConfirm}>Elimina</button>
        </div>
      </div>
    </div>
  );
}

function ImagePreview({ file, onClose }) {
  return (
    <div className="preview-overlay" onClick={onClose}>
      <button className="preview-close" onClick={onClose}><X size={20} /></button>
      <div className="preview-filename">{file.name}</div>
      <img
        src={`${API}/api/download?path=${encodeURIComponent(file.path)}`}
        alt={file.name}
        className="preview-image"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

export default function App() {
  const [logged, setLogged] = useState(!!getPassword());
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [clipboard, setClipboard] = useState(null); // { files, op: 'copy'|'cut' }
  const [viewMode, setViewMode] = useState('grid');
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const fileInputRef = useRef();
  const toastId = useRef(0);

  const toast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, message, type }]);
    if (duration > 0) setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
    return id;
  }, []);

  const removeToast = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  const loadDir = useCallback(async (p) => {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await apiFetch(`${API}/api/list?path=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (data.success) {
        setFiles(data.files);
        setCurrentPath(p);
      } else {
        toast(data.error || 'Errore caricamento', 'error');
      }
    } catch (e) {
      toast('Connessione al server fallita', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (logged) loadDir('/'); }, [loadDir, logged]);

  if (!logged) return <LoginScreen onLogin={() => setLogged(true)} />;

  const pathParts = currentPath.split('/').filter(Boolean);

  const navigate = (p) => { setSearch(''); loadDir(p); };

  const openItem = (file) => {
    if (file.type === 'directory') navigate(file.path);
    else if (file.type === 'image') setPreview(file);
  };

  const handleSelect = (file, e) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected(s => { const n = new Set(s); n.has(file.path) ? n.delete(file.path) : n.add(file.path); return n; });
    } else if (e.shiftKey) {
      const idx = filtered.findIndex(f => f.path === file.path);
      const lastIdx = filtered.findIndex(f => [...selected].at(-1) === f.path);
      const [a, b] = [Math.min(idx, lastIdx), Math.max(idx, lastIdx)];
      setSelected(s => { const n = new Set(s); filtered.slice(a, b+1).forEach(f => n.add(f.path)); return n; });
    } else {
      setSelected(new Set([file.path]));
    }
  };

  const getSelectedFiles = () => files.filter(f => selected.has(f.path));

  const handleDelete = async () => {
    const targets = getSelectedFiles();
    setModal({ type: 'delete', files: targets, onConfirm: async () => {
      setModal(null);
      const tid = toast(`Eliminazione in corso...`, 'loading', 0);
      for (const f of targets) {
        await apiFetch(`${API}/api/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: f.path, type: f.type }) });
      }
      removeToast(tid);
      toast(`${targets.length} elemento/i eliminato/i`);
      loadDir(currentPath);
    }});
  };

  const handleCopy = () => { setClipboard({ files: getSelectedFiles(), op: 'copy' }); toast('Copiato negli appunti'); };
  const handleCut = () => { setClipboard({ files: getSelectedFiles(), op: 'cut' }); toast('Pronto per lo spostamento'); };

  const handlePaste = async () => {
    if (!clipboard) return;
    const tid = toast(`${clipboard.op === 'copy' ? 'Copia' : 'Spostamento'} in corso...`, 'loading', 0);
    for (const f of clipboard.files) {
      const dest = `${currentPath === '/' ? '' : currentPath}/${f.name}`;
      if (clipboard.op === 'copy') {
        await apiFetch(`${API}/api/copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ src: f.path, dest }) });
      } else {
        await apiFetch(`${API}/api/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ src: f.path, dest }) });
      }
    }
    if (clipboard.op === 'cut') setClipboard(null);
    removeToast(tid);
    toast('Operazione completata');
    loadDir(currentPath);
  };

  const handleRename = (file) => {
    setModal({ type: 'rename', file, onConfirm: async (name) => {
      setModal(null);
      const dir = file.path.substring(0, file.path.lastIndexOf('/'));
      const dest = `${dir}/${name}`;
      await apiFetch(`${API}/api/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: file.path, dest }) });
      toast('Rinominato');
      loadDir(currentPath);
    }});
  };

  const handleNewFolder = () => {
    setModal({ type: 'newfolder', onConfirm: async (name) => {
      setModal(null);
      const p = `${currentPath === '/' ? '' : currentPath}/${name}`;
      await apiFetch(`${API}/api/mkdir`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p }) });
      toast('Cartella creata');
      loadDir(currentPath);
    }});
  };

  const handleUpload = async (e) => {
    const uploadFiles = Array.from(e.target.files);
    if (!uploadFiles.length) return;
    const tid = toast(`Upload di ${uploadFiles.length} file...`, 'loading', 0);
    for (const f of uploadFiles) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('path', currentPath);
      await apiFetch(`${API}/api/upload`, { method: 'POST', body: fd });
    }
    removeToast(tid);
    toast('Upload completato');
    loadDir(currentPath);
    e.target.value = '';
  };

  const handleDownload = (file) => {
    const a = document.createElement('a');
    a.href = `${API}/api/download?path=${encodeURIComponent(file.path)}`;
    a.download = file.name;
    a.click();
  };

  const handleContextMenu = (e, file) => {
    e.preventDefault();
    if (!selected.has(file.path)) setSelected(new Set([file.path]));
    const items = [
      file.type === 'directory' ? null : { label: 'Scarica', icon: <Download size={14} />, onClick: () => handleDownload(file) },
      file.type === 'image' ? { label: 'Anteprima', icon: <Eye size={14} />, onClick: () => setPreview(file) } : null,
      { separator: true },
      { label: 'Rinomina', icon: <FileText size={14} />, onClick: () => handleRename(file) },
      { label: 'Copia', icon: <Copy size={14} />, onClick: handleCopy },
      { label: 'Taglia', icon: <Scissors size={14} />, onClick: handleCut },
      clipboard ? { label: 'Incolla qui', icon: <ClipboardPaste size={14} />, onClick: handlePaste } : null,
      { separator: true },
      { label: 'Elimina', icon: <Trash2 size={14} />, danger: true, onClick: handleDelete },
    ].filter(Boolean);
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const filtered = files
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
      if (sortBy === 'date') return (b.modified || 0) - (a.modified || 0);
      return 0;
    });

  return (
    <div className="app" onClick={() => { setSelected(new Set()); setContextMenu(null); }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <HardDrive size={20} style={{ color: 'var(--accent)' }} />
          <span>My Drive</span>
        </div>
        <button className="btn btn-primary upload-btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
          <Upload size={15} /> Carica file
        </button>
        <button className="btn btn-ghost new-folder-btn" onClick={(e) => { e.stopPropagation(); handleNewFolder(); }}>
          <FolderPlus size={15} /> Nuova cartella
        </button>
        <nav className="sidebar-nav">
          <button className={`nav-item ${currentPath === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
            <Home size={15} /> Il mio Drive
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="storage-label">Hetzner Storagebox</div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8, fontSize: 12 }}
            onClick={() => { clearPassword(); setLogged(false); }}>
            Esci
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Toolbar */}
        <header className="toolbar">
          <div className="breadcrumb">
            <button className="crumb" onClick={() => navigate('/')}><Home size={14} /></button>
            {pathParts.map((part, i) => {
              const p = '/' + pathParts.slice(0, i + 1).join('/');
              return (
                <span key={p} className="crumb-group">
                  <ChevronRight size={13} className="crumb-sep" />
                  <button className={`crumb ${i === pathParts.length - 1 ? 'active' : ''}`} onClick={() => navigate(p)}>{part}</button>
                </span>
              );
            })}
          </div>
          <div className="toolbar-actions">
            <div className="search-box">
              <Search size={13} />
              <input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()} />
              {search && <button className="btn-icon" onClick={() => setSearch('')}><X size={13} /></button>}
            </div>
            {selected.size > 0 && (
              <div className="selection-actions fade-in" onClick={e => e.stopPropagation()}>
                <span className="selection-count">{selected.size} selezionato/i</span>
                <button className="btn-icon" title="Copia" onClick={handleCopy}><Copy size={15} /></button>
                <button className="btn-icon" title="Taglia" onClick={handleCut}><Scissors size={15} /></button>
                {clipboard && <button className="btn-icon" title="Incolla" onClick={handlePaste}><ClipboardPaste size={15} /></button>}
                <button className="btn-icon danger" title="Elimina" onClick={handleDelete}><Trash2 size={15} /></button>
              </div>
            )}
            {clipboard && selected.size === 0 && (
              <button className="btn btn-ghost fade-in" onClick={handlePaste}>
                <ClipboardPaste size={14} /> Incolla ({clipboard.files.length})
              </button>
            )}
            <button className="btn-icon" title="Aggiorna" onClick={() => loadDir(currentPath)}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
            <button className="btn-icon" title="Ordina" onClick={(e) => {
              e.stopPropagation();
              setSortBy(s => s === 'name' ? 'size' : s === 'size' ? 'date' : 'name');
            }}>
              <ArrowUpDown size={15} />
            </button>
            <button className="btn-icon" onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}>
              {viewMode === 'grid' ? <List size={15} /> : <LayoutGrid size={15} />}
            </button>
          </div>
        </header>

        {/* File area */}
        <div className="file-area" onDragOver={e => e.preventDefault()} onDrop={e => {
          e.preventDefault();
          const dt = e.dataTransfer;
          if (dt.files.length) {
            const fakeEvent = { target: { files: dt.files, value: '' } };
            handleUpload(fakeEvent);
          }
        }}>
          {loading ? (
            <div className="empty-state">
              <Loader2 size={32} className="spin" style={{ color: 'var(--accent)' }} />
              <p>Caricamento...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <Folder size={48} style={{ color: 'var(--border-bright)' }} />
              <p>{search ? 'Nessun risultato' : 'Cartella vuota'}</p>
              {!search && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Trascina file qui per caricarli</p>}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid-view fade-in">
              {filtered.map(file => (
                <div
                  key={file.path}
                  className={`grid-item ${selected.has(file.path) ? 'selected' : ''}`}
                  onClick={e => { e.stopPropagation(); handleSelect(file, e); }}
                  onDoubleClick={() => openItem(file)}
                  onContextMenu={e => handleContextMenu(e, file)}
                >
                  <div className="grid-thumb">
                    {file.type === 'image'
                      ? <img
                          src={`${API}/api/thumbnail?path=${encodeURIComponent(file.path)}`}
                          alt={file.name}
                          loading="lazy"
                          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                      : null}
                    <div className="grid-thumb-icon" style={{ display: file.type === 'image' ? 'none' : 'flex' }}>
                      <FileIcon type={file.type} name={file.name} size={32} />
                    </div>
                  </div>
                  <div className="grid-info">
                    <span className="grid-name" title={file.name}>{file.name}</span>
                    {file.type !== 'directory' && <span className="grid-size">{formatSize(file.size)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="list-view fade-in">
              <div className="list-header">
                <span>Nome</span>
                <span>Dimensione</span>
                <span>Modificato</span>
              </div>
              {filtered.map(file => (
                <div
                  key={file.path}
                  className={`list-item ${selected.has(file.path) ? 'selected' : ''}`}
                  onClick={e => { e.stopPropagation(); handleSelect(file, e); }}
                  onDoubleClick={() => openItem(file)}
                  onContextMenu={e => handleContextMenu(e, file)}
                >
                  <span className="list-name">
                    <FileIcon type={file.type} name={file.name} size={16} />
                    {file.name}
                  </span>
                  <span className="list-size">{file.type === 'directory' ? '—' : formatSize(file.size)}</span>
                  <span className="list-date">{formatDate(file.modified)}</span>
                  <button className="btn-icon list-more" onClick={e => { e.stopPropagation(); handleContextMenu(e, file); }}>
                    <MoreVertical size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {modal?.type === 'rename' && <RenameModal file={modal.file} onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}
      {modal?.type === 'newfolder' && <NewFolderModal onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}
      {modal?.type === 'delete' && <DeleteModal files={modal.files} onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}
      {preview && <ImagePreview file={preview} onClose={() => setPreview(null)} />}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}

      <Toast toasts={toasts} />
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
    </div>
  );
}
