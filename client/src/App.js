import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { io } from 'socket.io-client';

// --- Global socket connection ---
let globalSocket;
if (!globalSocket) {
  globalSocket = io('http://localhost:5000', { autoConnect: false });
}

function App() {
  const [page, setPage] = useState('home');
  const [form, setForm] = useState({ firstName: '', lastName: '', name: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [kids, setKids] = useState(user && user.kids ? user.kids : []);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '' });
  const [editKidIndex, setEditKidIndex] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Weather popup state
  const [weatherPopup, setWeatherPopup] = useState({ open: false, loading: false, error: '', data: null });
  const [showChat, setShowChat] = useState(false);
  const [unread, setUnread] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (e.target.name === 'firstName' || e.target.name === 'lastName') {
      const newFirst = e.target.name === 'firstName' ? e.target.value : form.firstName;
      const newLast = e.target.name === 'lastName' ? e.target.value : form.lastName;
      setForm(f => ({ ...f, name: `${newFirst} ${newLast}`.trim() }));
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    // Password validation: only numbers, at least 6 digits
    if (!/^\d{6,}$/.test(form.password)) {
      setError('Password must be a number with at least 6 digits.');
      return;
    }
    try {
      const res = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        // Check for duplicate phone error from backend (MongoDB duplicate key error)
        if (data.details && data.details.code === 11000) {
          setError('This phone number is already registered. Please use a different phone number or sign in.');
        } else {
          setError(data.error || 'Registration failed');
        }
        return;
      }
      setUser(data.user);
      setEditForm({ name: data.user.name, phone: data.user.phone });
      setPage('account');
      setForm({ firstName: '', lastName: '', name: '', phone: '', password: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    // Admin shortcut: if admin credentials, set admin state and go to admin page
    if (form.phone === 'admin' && form.password === 'admin') {
      setIsAdmin(true);
      setPage('admin');
      setUser(null);
      setForm({ firstName: '', lastName: '', name: '', phone: '', password: '' });
      return;
    }
    try {
      const res = await fetch('http://localhost:5000/api/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Show specific error if phone is not found or credentials are invalid
        if (data.error === 'Invalid credentials') {
          setError('Phone number or password is incorrect, or this phone number is not registered.');
        } else if (data.error === 'User is blocked') {
          setError(`Your account is blocked. Reason: ${data.blockReason || 'No reason provided.'}`);
        } else {
          setError(data.error || 'Sign in failed');
        }
        return;
      }
      setUser(data.user);
      setEditForm({ name: data.user.name, phone: data.user.phone });
      setPage('account');
    } catch (err) {
      setError(err.message);
    }
  };

  // Admin sign in (for demo: phone 'admin', password 'admin')
  const handleAdminSignIn = async (e) => {
    e.preventDefault();
    setError('');
    if (form.phone === 'admin' && form.password === 'admin') {
      setIsAdmin(true);
      setPage('admin');
      setUser(null);
      setForm({ firstName: '', lastName: '', name: '', phone: 'admin', password: 'admin' });
    } else {
      setError('Invalid admin credentials');
    }
  };

  // Sync kids with backend
  const syncKids = async (newKids) => {
    if (!user) return;
    try {
      await fetch('http://localhost:5000/api/user/kids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: user.phone, kids: newKids })
      });
    } catch {}
  };

  // Sync member info with backend
  const syncMember = async (newName, newPhone) => {
    if (!user) return;
    try {
      const res = await fetch('http://localhost:5000/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: user.phone, name: newName, newPhone })
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setEditForm({ name: data.user.name, phone: data.user.phone });
      }
    } catch {}
  };

  // Edit member info
  const handleEditMember = (e) => {
    e.preventDefault();
    syncMember(editForm.name, editForm.phone);
    setEditMode(false);
  };

  // Add kid
  const handleAddKid = (kid) => {
    // Calculate age and assign group
    const currentYear = new Date().getFullYear();
    const age = currentYear - parseInt(kid.year, 10);
    const group = age >= 10 ? 'A' : 'B';
    const kidWithGroup = { ...kid, group };
    const newKids = [...kids, kidWithGroup];
    setKids(newKids);
    syncKids(newKids);
    setPage('account');
  };

  // Edit kid
  const handleEditKid = (index, newKid) => {
    // Recalculate group on edit
    const currentYear = new Date().getFullYear();
    const age = currentYear - parseInt(newKid.year, 10);
    const group = age >= 10 ? 'A' : 'B';
    const updatedKid = { ...newKid, group };
    const updated = kids.map((k, i) => (i === index ? updatedKid : k));
    setKids(updated);
    syncKids(updated);
    setEditKidIndex(null);
  };

  // When user changes (sign in/register), update kids state
  React.useEffect(() => {
    setKids(user && user.kids ? user.kids : []);
  }, [user]);

  // Fetch all parents and kids for admin
  const [allParents, setAllParents] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  React.useEffect(() => {
    if (isAdmin && page === 'admin') {
      setAdminLoading(true);
      setAdminError('');
      fetch('http://localhost:5000/api/all-parents')
        .then(res => res.json())
        .then(data => {
          // Show password field for admin view
          setAllParents(data.parents || []);
          setAdminLoading(false);
        })
        .catch(() => {
          setAdminError('Failed to fetch parents.');
          setAdminLoading(false);
        });
    }
  }, [isAdmin, page]);

  // Admin edit handlers
  const handleAdminEditParent = (idx, field, value) => {
    const updated = [...allParents];
    updated[idx][field] = value;
    setAllParents(updated);
  };
  const handleAdminEditKid = (parentIdx, kidIdx, field, value) => {
    const updated = [...allParents];
    updated[parentIdx].kids[kidIdx][field] = value;
    setAllParents(updated);
  };
  const handleAdminSaveParent = async (parent) => {
    await fetch('http://localhost:5000/api/admin/update-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parent)
    });
  };
  const handleAdminSaveKid = async (parent, kid) => {
    await fetch('http://localhost:5000/api/admin/update-kid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPhone: parent.phone, kid })
    });
  };

  // Add navigation
  const [gotoOpen, setGotoOpen] = useState(false);
  const renderHeader = () => (
    <nav className="main-nav">
      <div className="isc-logo-nav" onClick={() => setPage('home')} style={{cursor:'pointer'}} title="Go to Home">
        <span className="isc-logo-text" style={{color:'#1a7f3c', fontWeight:'bold', fontSize:'2rem', textShadow:'1px 2px 8px #fff'}}>ISC</span>
      </div>
      <span className="nav-title" onClick={() => setPage('home')}>Islamic Soccer Club</span>
      <div className="nav-links">
        <button onClick={() => setPage('home')}>Home</button>
        <button onClick={() => setPage('about')}>About Us</button>
        <button onClick={() => setPage('contact')}>Contact Us</button>
        {/* Drive To dropdown (only german club) */}
        <div style={{display:'inline-block', position:'relative'}}
          onMouseEnter={() => setGotoOpen(true)}
          onMouseLeave={() => setGotoOpen(false)}>
          <button style={{background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'8px 18px', fontWeight:600, fontSize:'1rem', marginLeft:8}}>
            Drive To ▼
          </button>
          {gotoOpen && (
            <div className="goto-dropdown" style={{position:'absolute', top:'110%', left:0, background:'#fff', boxShadow:'0 2px 8px #1a7f3c22', borderRadius:6, minWidth:160, zIndex:10}}>
              <div className="goto-item" style={{padding:'10px 18px', cursor:'pointer', color:'#1a7f3c'}} onClick={() => {
                // Open Google Maps directions from current location to German Club (updated address)
                const destination = encodeURIComponent('49 Salem Church Rd, Newark, Delaware 19713');
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    pos => {
                      const { latitude, longitude } = pos.coords;
                      const url = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${destination}&travelmode=driving`;
                      window.open(url, '_blank');
                    },
                    () => {
                      // If user denies location, just open directions to destination
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
                      window.open(url, '_blank');
                    }
                  );
                } else {
                  // Fallback: just open directions to destination
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
                  window.open(url, '_blank');
                }
              }}>german club</div>
            </div>
          )}
        </div>
        {/* Weather Button */}
        <button
          style={{background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'8px 18px', fontWeight:600, fontSize:'1rem', marginLeft:8}}
          onClick={async () => {
            if (!window.navigator.geolocation) {
              setWeatherPopup({ open: true, loading: false, error: 'Geolocation is not supported by your browser.', data: null });
              return;
            }
            setWeatherPopup({ open: true, loading: true, error: '', data: null });
            navigator.geolocation.getCurrentPosition(async pos => {
              const lat = pos.coords.latitude;
              const lon = pos.coords.longitude;
              const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
              try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.current_weather) {
                  setWeatherPopup({ open: true, loading: false, error: '', data: data.current_weather });
                } else {
                  setWeatherPopup({ open: true, loading: false, error: 'Could not fetch weather.', data: null });
                }
              } catch {
                setWeatherPopup({ open: true, loading: false, error: 'Could not fetch weather.', data: null });
              }
            }, () => setWeatherPopup({ open: true, loading: false, error: 'Could not get your location.', data: null }));
          }}
        >Weather</button>
      </div>
    </nav>
  );

  // --- ChatBox Component ---
  function ChatBox({ user, isAdmin, allUsers, onClose, onUnread, globalSocket }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [chatMode, setChatMode] = useState('group'); // 'group' or 'private'
    const [privateTarget, setPrivateTarget] = useState('');
    const bottomRef = useRef();

    useEffect(() => {
      if (!globalSocket.connected) globalSocket.connect();
      if (chatMode === 'group') {
        globalSocket.emit('joinGroup');
        fetch('http://localhost:5000/api/chat/history?group=1')
          .then(res => res.json())
          .then(data => setMessages(data.messages || []));
      } else if (privateTarget) {
        globalSocket.emit('join', user ? user.phone : 'admin');
        fetch(`http://localhost:5000/api/chat/history?user1=${user ? user.phone : 'admin'}&user2=${privateTarget}`)
          .then(res => res.json())
          .then(data => setMessages(data.messages || []));
      }
      const handler = msg => {
        setMessages(m => [...m, msg]);
        if (onUnread && document.hidden) onUnread();
        if (onUnread && !showChat) onUnread(); // increment if chat is closed
      };
      globalSocket.on('chatMessage', handler);
      return () => { globalSocket.off('chatMessage', handler); };
    }, [chatMode, privateTarget, user, globalSocket]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const sendMessage = () => {
      if (!input.trim()) return;
      const sender = user ? user.phone : 'admin';
      const receiver = chatMode === 'group' ? 'group' : privateTarget;
      globalSocket.emit('chatMessage', { sender, receiver, message: input });
      setInput('');
    };

    return (
      <div style={{position:'fixed', bottom:24, right:24, width:340, background:'#fff', border:'2px solid #1a7f3c', borderRadius:12, boxShadow:'0 2px 16px #1a7f3c33', zIndex:2000, display:'flex', flexDirection:'column', height:480}}>
        <div style={{background:'#1a7f3c', color:'#fff', padding:'12px 16px', borderTopLeftRadius:10, borderTopRightRadius:10, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span style={{fontWeight:700}}>Chat {chatMode === 'group' ? '(Group)' : `(Private: ${privateTarget})`}</span>
          <button onClick={onClose} style={{background:'none', border:'none', color:'#fff', fontSize:'1.2rem', fontWeight:700, cursor:'pointer'}}>×</button>
        </div>
        <div style={{padding:'8px 12px', borderBottom:'1px solid #eee', display:'flex', gap:8}}>
          <button onClick={()=>setChatMode('group')} style={{background:chatMode==='group'?'#1a7f3c':'#e3eafc', color:chatMode==='group'?'#fff':'#1a7f3c', border:'none', borderRadius:6, padding:'4px 10px', fontWeight:600}}>Group</button>
          <button onClick={()=>setChatMode('private')} style={{background:chatMode==='private'?'#1a7f3c':'#e3eafc', color:chatMode==='private'?'#fff':'#1a7f3c', border:'none', borderRadius:6, padding:'4px 10px', fontWeight:600}}>Private</button>
          {chatMode==='private' && (
            <select value={privateTarget} onChange={e=>setPrivateTarget(e.target.value)} style={{marginLeft:8}}>
              <option value=''>Select user</option>
              {isAdmin
                ? allUsers.filter(u=>u.phone!=='admin').map(u=>(<option key={u.phone} value={u.phone}>{u.name} ({u.phone})</option>))
                : [<option key='admin' value='admin'>Admin</option>]
              }
            </select>
          )}
        </div>
        <div style={{flex:1, overflowY:'auto', padding:'8px 12px', background:'#f8fafd'}}>
          {messages.map((msg,i)=>(
            <div key={i} style={{margin:'6px 0', textAlign:msg.sender===(user?user.phone:'admin')?'right':'left'}}>
              <span style={{display:'inline-block', background:msg.sender===(user?user.phone:'admin')?'#1a7f3c':'#e3eafc', color:msg.sender===(user?user.phone:'admin')?'#fff':'#1a7f3c', borderRadius:8, padding:'6px 12px', maxWidth:220, wordBreak:'break-word'}}>
                <b>{msg.sender=== (user?user.phone:'admin') ? 'Me' : (msg.sender==='admin'?'Admin':msg.sender)}</b>: {msg.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef}></div>
        </div>
        <div style={{display:'flex', borderTop:'1px solid #eee', padding:8, background:'#fff'}}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} style={{flex:1, border:'1px solid #ccc', borderRadius:6, padding:'6px 10px', fontSize:'1rem'}} placeholder='Type a message...' />
          <button onClick={sendMessage} style={{marginLeft:8, background:'#1a7f3c', color:'#fff', border:'none', borderRadius:6, padding:'6px 16px', fontWeight:600}}>Send</button>
        </div>
      </div>
    );
  }

  const renderPageContent = () => {
    switch (page) {
      case 'home':
        return (
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'40vh', gap:'18px'}}>
            <div style={{display:'flex', gap:'18px'}}>
              <button onClick={() => setPage('register')}>Register</button>
              <button onClick={() => setPage('signin')}>Sign In</button>
              <button onClick={() => { setForm({ firstName: '', lastName: '', name: '', phone: 'admin', password: 'admin' }); setPage('signin'); }}>Admin</button>
            </div>
          </div>
        );
      case 'register':
        return (
          <form onSubmit={handleRegister} className="form">
            <h2>Register</h2>
            <input name="firstName" placeholder="First Name" value={form.firstName} onChange={handleChange} required />
            <input name="lastName" placeholder="Last Name" value={form.lastName} onChange={handleChange} required />
            <input name="phone" placeholder="Phone Number" value={form.phone} onChange={handleChange} required />
            <input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required />
            <button type="submit">Register</button>
            <button type="button" onClick={() => setPage('home')}>Back</button>
            {error && <div style={{ color: 'red' }}>{error}</div>}
          </form>
        );
      case 'signin':
        return (
          <form onSubmit={isAdmin ? handleAdminSignIn : handleSignIn} className="form">
            <h2>Sign In</h2>
            <input name="phone" placeholder="Phone Number" value={form.phone} onChange={handleChange} required />
            <input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required />
            <button type="submit">Sign In</button>
            <button type="button" onClick={() => setPage('home')}>Back</button>
            {error && <div style={{ color: 'red' }}>{error}</div>}
            <div style={{marginTop:8}}>
              <button type="button" onClick={() => { setForm({ firstName: '', lastName: '', name: '', phone: 'admin', password: 'admin' }); }}>Admin Sign In</button>
            </div>
          </form>
        );
      case 'account':
        return user && (
          <div style={{maxWidth:600, margin:'0 auto', padding:'48px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:32}}>
            <h2 style={{color:'#1a7f3c', fontWeight:700, marginBottom:24, fontSize:'2.2rem', letterSpacing:1}}>My Account</h2>
            <button onClick={() => setPage('myInfo')} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a7f3c22'}}>My Info</button>
            <button onClick={() => setPage('addKid')} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a7f3c22'}}>Add Kid</button>
            <button onClick={() => setPage('editMember')} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a7f3c22'}}>Edit Member Info</button>
            <button onClick={() => setPage('mediaGalleryView')} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a7f3c22'}}>Media Gallery</button>
            <button onClick={() => setPage('teams')} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a7f3c22'}}>View Teams</button>
            <button onClick={()=>{setShowChat(true); setUnreadCount(0);}} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a7f3c22'}}>Open Chat</button>
            <button onClick={() => { setUser(null); setPage('home'); }} style={{width:'100%', background:'#c0392b', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginTop:16}}>Log Out</button>
          </div>
        );
      case 'mediaGalleryView':
        return (
          <MediaGalleryView onBack={() => setPage('account')} />
        );
      case 'teams':
        return (
          <TeamsPage onBack={() => setPage('account')} />
        );
      case 'myInfo':
        return user && (
          <div style={{maxWidth:500, margin:'40px auto', background:'#fff', borderRadius:12, boxShadow:'0 2px 8px #1a7f3c22', padding:32, textAlign:'left'}}>
            <h2 style={{color:'#1a7f3c', fontWeight:700, marginBottom:24}}>My Info</h2>
            <div style={{marginBottom:16, fontSize:'1.1rem'}}><b>Name:</b> {user.name}</div>
            <div style={{marginBottom:16, fontSize:'1.1rem'}}><b>Phone:</b> {user.phone}</div>
            <div style={{marginBottom:16, fontSize:'1.1rem'}}><b>Kids:</b> {user.kids && user.kids.length > 0 ? user.kids.map((kid, i) => (
              <div key={i} style={{marginLeft:16}}>- {kid.name} (Born: {kid.year}, Group: {kid.group || (new Date().getFullYear() - parseInt(kid.year, 10) >= 10 ? 'A' : 'B')})</div>
            )) : <span style={{color:'#888'}}>No kids added yet.</span>}</div>
            <button onClick={() => setPage('account')} style={{marginTop:24, background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'8px 18px', fontWeight:600, fontSize:'1rem'}}>Back</button>
          </div>
        );
      case 'editMember':
        return (
          <form className="form" onSubmit={handleEditMember}>
            <h3>Edit Member Info</h3>
            <input name="name" placeholder="Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
            <input name="phone" placeholder="Phone" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} required />
            <button type="submit">Save</button>
            <button type="button" onClick={() => setPage('account')}>Cancel</button>
          </form>
        );
      case 'addKid':
        return (
          <AddKidForm onBack={() => setPage('account')} onAdd={handleAddKid} />
        );
      case 'about':
        return <AboutUs onBack={() => setPage('home')} />;
      case 'contact':
        return <ContactUs onBack={() => setPage('home')} />;
      /* --- ADMIN PAGE --- */
      case 'admin':
        return (
          <div style={{maxWidth:600, margin:'0 auto', padding:'48px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:32}}>
            <h2 style={{color:'#1a237e', fontWeight:700, marginBottom:24, fontSize:'2.2rem', letterSpacing:1}}>Admin Dashboard</h2>
            <button onClick={() => setPage('adminUserManagement')} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a237e22'}}>User Management</button>
            <button onClick={() => setPage('adminMediaUpload')} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a237e22'}}>Upload Media</button>
            <button onClick={() => setPage('adminMediaGallery')} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a237e22'}}>Media Gallery</button>
            <button onClick={() => setPage('adminTeams')} style={{width:'100%', background:'#1a7f3c', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginBottom:8, boxShadow:'0 2px 8px #1a237e22'}}>View Teams</button>
            <button onClick={() => { setIsAdmin(false); setPage('home'); }} style={{width:'100%', background:'#c0392b', color:'#fff', border:'none', borderRadius:8, padding:'18px 0', fontWeight:700, fontSize:'1.2rem', marginTop:16}}>Log Out</button>
          </div>
        );
      case 'adminUserManagement':
        return (
          <div style={{maxWidth:1200, margin:'0 auto', padding:'32px 0'}}>
            <h2 style={{color:'#1a237e', fontWeight:700, marginBottom:24, fontSize:'2.2rem', letterSpacing:1}}>User Management</h2>
            <div style={{background:'#fff', borderRadius:12, boxShadow:'0 2px 8px #1a237e22', padding:24, marginBottom:32}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'1rem', background:'#fff', minWidth:900}}>
                  <thead>
                    <tr style={{background:'#e3eafc', color:'#1a237e'}}>
                      <th style={{padding:'10px 8px', border:'1px solid #e0e0e0'}}>Name</th>
                      <th style={{padding:'10px 8px', border:'1px solid #e0e0e0'}}>Phone</th>
                      <th style={{padding:'10px 8px', border:'1px solid #e0e0e0'}}>Password</th>
                      <th style={{padding:'10px 8px', border:'1px solid #e0e0e0'}}>Status</th>
                      <th style={{padding:'10px 8px', border:'1px solid #e0e0e0'}}>Block Reason</th>
                      <th style={{padding:'10px 8px', border:'1px solid #e0e0e0'}}>Kids</th>
                      <th style={{padding:'10px 8px', border:'1px solid #e0e0e0'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allParents.length === 0 && (
                      <tr><td colSpan={7} style={{textAlign:'center', color:'#1a237e', padding:'18px', background:'#eaf0fa'}}>No parents found.</td></tr>
                    )}
                    {allParents.map((parent, pIdx) => (
                      <tr key={parent._id} style={{background:pIdx%2===0?'#f9f9f9':'#fff'}}>
                        <td style={{padding:'8px', border:'1px solid #e0e0e0'}}>
                          <input value={parent.name} onChange={e => handleAdminEditParent(pIdx, 'name', e.target.value)} style={{width:'100%', border:'none', background:'transparent', fontWeight:600, color:'#1a237e'}} />
                        </td>
                        <td style={{padding:'8px', border:'1px solid #e0e0e0'}}>
                          <input value={parent.phone} onChange={e => handleAdminEditParent(pIdx, 'phone', e.target.value)} style={{width:'100%', border:'none', background:'transparent', color:'#222'}} />
                        </td>
                        <td style={{padding:'8px', border:'1px solid #e0e0e0'}}>
                          <input value={parent.password} onChange={e => handleAdminEditParent(pIdx, 'password', e.target.value)} style={{width:'100%', border:'none', background:'transparent', color:'#222'}} />
                        </td>
                        <td style={{padding:'8px', border:'1px solid #e0e0e0', color:parent.blocked?'#c0392b':'#1a7f3c', fontWeight:600}}>
                          <select value={parent.blocked ? 'Blocked' : 'Active'} onChange={e => handleAdminEditParent(pIdx, 'blocked', e.target.value==='Blocked')} style={{border:'none', background:'transparent', fontWeight:600, color:parent.blocked?'#c0392b':'#1a7f3c'}}>
                            <option value="Active">Active</option>
                            <option value="Blocked">Blocked</option>
                          </select>
                        </td>
                        <td style={{padding:'8px', border:'1px solid #e0e0e0'}}>
                          <input value={parent.blockReason || ''} onChange={e => handleAdminEditParent(pIdx, 'blockReason', e.target.value)} style={{width:'100%', border:'none', background:'transparent', color:'#c0392b'}} />
                        </td>
                        <td style={{padding:'8px', border:'1px solid #e0e0e0'}}>
                          {parent.kids && parent.kids.length > 0 ? (
                            <div style={{display:'flex', flexDirection:'column', gap:4}}>
                              {parent.kids.map((kid, kIdx) => (
                                <div key={kid._id || kIdx} style={{display:'flex', gap:4, alignItems:'center'}}>
                                  <input value={kid.name} onChange={e => handleAdminEditKid(pIdx, kIdx, 'name', e.target.value)} style={{width:80, border:'none', background:'transparent', color:'#222'}} />
                                  <input value={kid.year} onChange={e => handleAdminEditKid(pIdx, kIdx, 'year', e.target.value)} style={{width:60, border:'none', background:'transparent', color:'#222'}} />
                                  <span style={{color:'#1a7f3c', fontWeight:600}}>{kid.group}</span>
                                  <button onClick={() => handleAdminSaveKid(parent, kid)} style={{marginLeft:4, background:'#e3eafc', color:'#1a237e', border:'none', borderRadius:4, padding:'2px 8px', fontWeight:600, fontSize:'0.9rem'}}>Save</button>
                                </div>
                              ))}
                            </div>
                          ) : <span style={{color:'#888'}}>No kids</span>}
                        </td>
                        <td style={{padding:'8px', border:'1px solid #e0e0e0'}}>
                          <button onClick={() => handleAdminSaveParent(parent)} style={{background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'4px 12px', fontWeight:600, fontSize:'0.95rem'}}>Save</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => setPage('admin')} style={{marginTop:24, background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'8px 18px', fontWeight:600, fontSize:'1rem'}}>Back to Admin Dashboard</button>
            </div>
          </div>
        );
      case 'adminMediaUpload':
        return (
          <div style={{maxWidth:600, margin:'0 auto', padding:'32px 0'}}>
            <h2 style={{color:'#1a237e', fontWeight:700, marginBottom:24, fontSize:'2.2rem', letterSpacing:1}}>Upload Media</h2>
            <MediaUpload />
            <button onClick={() => setPage('admin')} style={{marginTop:32, background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'8px 18px', fontWeight:600, fontSize:'1rem'}}>Back to Admin Dashboard</button>
          </div>
        );
      case 'adminMediaGallery':
        return (
          <div style={{maxWidth:1200, margin:'0 auto', padding:'32px 0'}}>
            <h2 style={{color:'#1a237e', fontWeight:700, marginBottom:24, fontSize:'2.2rem', letterSpacing:1}}>Media Gallery</h2>
            <MediaGallery />
            <button onClick={() => setPage('admin')} style={{marginTop:32, background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'8px 18px', fontWeight:600, fontSize:'1rem'}}>Back to Admin Dashboard</button>
          </div>
        );
      case 'adminTeams':
        return (
          <TeamsPage onBack={() => setPage('admin')} />
        );
      default:
        return null;
    }
  };

  // Join group room as soon as user is on account/admin page
  useEffect(() => {
    if ((page === 'account' && user) || page === 'admin') {
      if (!globalSocket.connected) globalSocket.connect();
      globalSocket.emit('joinGroup');
    }
    // Do NOT disconnect the socket when leaving the page, just leave the group room
    // else {
    //   if (globalSocket.connected) globalSocket.disconnect();
    // }
  }, [page, user]);

  // Listen for document visibility change to clear unread
  useEffect(() => {
    const handler = () => { if (!document.hidden) setUnreadCount(0); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return (
    <div className="App">
      {renderHeader()}
      {weatherPopup.open && (
        <WeatherPopup
          loading={weatherPopup.loading}
          error={weatherPopup.error}
          data={weatherPopup.data}
          onClose={() => setWeatherPopup({ open: false, loading: false, error: '', data: null })}
        />
      )}
      <header className="App-header">
        <h1 style={{display:'none'}}>Islamic Soccer Club</h1>
        {renderPageContent()}
        {/* Chat button and box */}
        {page === 'admin' && (
          <>
            <button onClick={()=>{setShowChat(true); setUnreadCount(0);}} style={{position:'fixed', bottom:24, right:24, background:'#1a7f3c', color:'#fff', border:'none', borderRadius:50, width:56, height:56, fontSize:'2rem', boxShadow:'0 2px 8px #1a7f3c44', position:'relative'}}>
              💬
              {unreadCount > 0 && <span style={{position:'absolute', top:6, right:6, minWidth:18, height:18, background:'red', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'0.95rem', border:'2px solid #fff', padding:'0 5px'}}>{unreadCount}</span>}
            </button>
            {showChat && <ChatBox user={null} isAdmin={true} allUsers={allParents} onClose={()=>setShowChat(false)} onUnread={()=>setUnreadCount(c=>c+1)} globalSocket={globalSocket} />}
          </>
        )}
        {page === 'account' && user && (
          <>
            <button onClick={()=>{setShowChat(true); setUnreadCount(0);}} style={{position:'fixed', bottom:24, right:24, background:'#1a7f3c', color:'#fff', border:'none', borderRadius:50, width:56, height:56, fontSize:'2rem', boxShadow:'0 2px 8px #1a7f3c44', position:'relative'}}>
              💬
              {unreadCount > 0 && <span style={{position:'absolute', top:6, right:6, minWidth:18, height:18, background:'red', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'0.95rem', border:'2px solid #fff', padding:'0 5px'}}>{unreadCount}</span>}
            </button>
            {showChat && <ChatBox user={user} isAdmin={false} allUsers={[]} onClose={()=>setShowChat(false)} onUnread={()=>setUnreadCount(c=>c+1)} globalSocket={globalSocket} />}
          </>
        )}
      </header>
    </div>
  );
}

// Update AddKidForm to accept onAdd
function AddKidForm({ onBack, onAdd }) {
  const [kid, setKid] = React.useState({ name: '', year: '' });
  const [msg, setMsg] = React.useState('');

  const handleChange = (e) => {
    setKid({ ...kid, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(kid);
    setMsg(`Added kid: ${kid.name} (Born: ${kid.year})`);
    setKid({ name: '', year: '' });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2>Add Kid</h2>
      <input name="name" placeholder="Kid's Name" value={kid.name} onChange={handleChange} required />
      <input name="year" placeholder="Year of Birth" value={kid.year} onChange={handleChange} required type="number" min="2000" max={new Date().getFullYear()} />
      <button type="submit">Add</button>
      <button type="button" onClick={onBack}>Back</button>
      {msg && <div style={{ color: 'green' }}>{msg}</div>}
    </form>
  );
}

function AboutUs({ onBack }) {
  return (
    <div className="info-page">
      <h2 style={{ color: '#fff' }}>About Us</h2>
      <p style={{ color: '#fff', textShadow: '1px 2px 8px #000', lineHeight: 1.7 }}>
        Islamic Soccer Club is more than just a place to play soccer—it's a community where young players grow in skill, character, and faith. We are dedicated to fostering unity, discipline, and personal development, guided by Islamic values and a spirit of inclusivity. Our club welcomes players of all backgrounds and abilities, encouraging teamwork, respect, and perseverance both on and off the field.<br /><br />
        Through friendly matches, skill-building sessions, and community events, we aim to strengthen bonds within the Muslim community and beyond. We believe in playing with purpose, supporting one another, and striving for excellence while honoring our commitment to faith and sportsmanship. Join us as we build lasting friendships, develop as athletes, and celebrate the joy of soccer together.
      </p>
      <button onClick={onBack}>Back</button>
    </div>
  );
}

function ContactUs({ onBack }) {
  const [form, setForm] = React.useState({ name: '', email: '', body: '' });
  const [msg, setMsg] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('http://localhost:5000/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setMsg('Your message has been sent!');
      setForm({ name: '', email: '', body: '' });
    } catch (err) {
      setMsg('Failed to send message. Please try again later.');
    }
    setLoading(false);
  };

  return (
    <div className="info-page">
      <h2>Contact Us</h2>
      <form className="form" onSubmit={handleSubmit}>
        <input name="name" placeholder="Your Name" value={form.name} onChange={handleChange} required />
        <input name="email" type="email" placeholder="Your Email" value={form.email} onChange={handleChange} required />
        <textarea name="body" placeholder="Your Message" value={form.body} onChange={handleChange} required rows={5} style={{resize:'vertical'}} />
        <button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send'}</button>
      </form>
      {msg && <div style={{ color: msg.includes('sent') ? 'green' : 'red' }}>{msg}</div>}
      <button onClick={onBack}>Back</button>
    </div>
  );
}

// MediaUpload component for admin
function MediaUpload() {
  const [file, setFile] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setMsg('');
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setMsg('');
    const formData = new FormData();
    formData.append('media', file);
    try {
      const res = await fetch('http://localhost:5000/api/admin/upload-media', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMsg('Upload successful!');
      setFile(null);
    } catch (err) {
      setMsg('Upload failed.');
    }
    setUploading(false);
  };

  return (
    <form onSubmit={handleUpload} style={{display:'flex', alignItems:'center', gap:12, background:'#f4f8f6', padding:12, borderRadius:8, boxShadow:'0 1px 4px #1a7f3c22'}}>
      <label style={{fontWeight:600, color:'#1a7f3c'}}>Upload Media:</label>
      <input type="file" onChange={handleFileChange} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.rar,.txt" />
      <button type="submit" disabled={uploading || !file} style={{background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'6px 16px', fontWeight:600}}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
      {msg && <span style={{marginLeft:8, color:msg.includes('success')?'green':'red'}}>{msg}</span>}
    </form>
  );
}

// MediaGallery component for admin
function MediaGallery() {
  const [files, setFiles] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setLoading(true);
    setError('');
    fetch('http://localhost:5000/uploads')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch media list');
        return res.json();
      })
      .then(data => {
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load media files.');
        setLoading(false);
      });
  }, []);

  const getFileUrl = (filename) => `http://localhost:5000/uploads/${encodeURIComponent(filename)}`;
  const isImage = (name) => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(name);
  const isVideo = (name) => /\.(mp4|webm|ogg)$/i.test(name);
  const isAudio = (name) => /\.(mp3|wav|ogg)$/i.test(name);

  const handleDelete = async (filename) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;
    try {
      const res = await fetch(`http://localhost:5000/uploads/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Delete failed');
      setFiles(files => files.filter(f => f !== filename));
    } catch {
      alert('Failed to delete file.');
    }
  };

  return (
    <div style={{margin:'24px 0'}}>
      <h3>Media Gallery</h3>
      {loading && <div>Loading media...</div>}
      {error && <div style={{color:'red'}}>{error}</div>}
      {!loading && !error && files.length === 0 && <div style={{color:'#888'}}>No media files uploaded yet.</div>}
      <div style={{display:'flex', flexWrap:'wrap', gap:24}}>
        {files.map((file, i) => (
          <div key={file} style={{border:'1px solid #e0e0e0', borderRadius:8, padding:8, background:'#fff', width:180, textAlign:'center', boxShadow:'0 1px 4px #1a7f3c22'}}>
            <div style={{marginBottom:8, minHeight:100}}>
              {isImage(file) ? (
                <img src={getFileUrl(file)} alt={file} style={{maxWidth:'100%', maxHeight:90, borderRadius:4}} />
              ) : isVideo(file) ? (
                <video src={getFileUrl(file)} controls style={{maxWidth:'100%', maxHeight:90, borderRadius:4}} />
              ) : isAudio(file) ? (
                <audio src={getFileUrl(file)} controls style={{width:'100%'}} />
              ) : (
                <span style={{fontSize:32, color:'#1a7f3c'}}>&#128196;</span>
              )}
            </div>
            <div style={{fontSize:12, wordBreak:'break-all'}}>{file}</div>
            <a href={getFileUrl(file)} download style={{display:'block', marginTop:6, color:'#1a7f3c', fontWeight:600}}>Download</a>
            <a href={getFileUrl(file)} target="_blank" rel="noopener noreferrer" style={{display:'block', color:'#1a7f3c'}}>Open</a>
            <button onClick={() => handleDelete(file)} style={{marginTop:6, color:'#fff', background:'#c0392b', border:'none', borderRadius:4, padding:'4px 10px', fontWeight:600, cursor:'pointer'}}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Read-only MediaGallery for members (view/preview only, no download)
function ReadOnlyMediaGallery() {
  const [files, setFiles] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setLoading(true);
    setError('');
    fetch('http://localhost:5000/uploads')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch media list');
        return res.json();
      })
      .then(data => {
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load media files.');
        setLoading(false);
      });
  }, []);

  const getFileUrl = (filename) => `http://localhost:5000/uploads/${encodeURIComponent(filename)}`;
  const isImage = (name) => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(name);
  const isVideo = (name) => /\.(mp4|webm|ogg)$/i.test(name);
  const isAudio = (name) => /\.(mp3|wav|ogg)$/i.test(name);

  return (
    <div style={{margin:'24px 0'}}>
      <h3>Media Gallery</h3>
      {loading && <div>Loading media...</div>}
      {error && <div style={{color:'red'}}>{error}</div>}
      {!loading && !error && files.length === 0 && <div style={{color:'#888'}}>No media files uploaded yet.</div>}
      <div style={{display:'flex', flexWrap:'wrap', gap:24}}>
        {files.map((file, i) => (
          <div key={file} style={{border:'1px solid #e0e0e0', borderRadius:8, padding:8, background:'#fff', width:180, textAlign:'center', boxShadow:'0 1px 4px #1a7f3c22'}}>
            <div style={{marginBottom:8, minHeight:100}}>
              {isImage(file) ? (
                <img src={getFileUrl(file)} alt={file} style={{maxWidth:'100%', maxHeight:90, borderRadius:4}} />
              ) : isVideo(file) ? (
                <video src={getFileUrl(file)} controls style={{maxWidth:'100%', maxHeight:90, borderRadius:4}} />
              ) : isAudio(file) ? (
                <audio src={getFileUrl(file)} controls style={{width:'100%'}} />
              ) : (
                <span style={{fontSize:32, color:'#1a7f3c'}}>&#128196;</span>
              )}
            </div>
            <div style={{fontSize:12, wordBreak:'break-all'}}>{file}</div>
            {/* No download or open links for members */}
          </div>
        ))}
      </div>
    </div>
  );
}

// New page: MediaGalleryView (read-only, see only, no download)
function MediaGalleryView({ onBack }) {
  const [files, setFiles] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setLoading(true);
    setError('');
    fetch('http://localhost:5000/uploads')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch media list');
        return res.json();
      })
      .then(data => {
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load media files.');
        setLoading(false);
      });
  }, []);

  const getFileUrl = (filename) => `http://localhost:5000/uploads/${encodeURIComponent(filename)}`;
  const isImage = (name) => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(name);
  const isVideo = (name) => /\.(mp4|webm|ogg)$/i.test(name);
  const isAudio = (name) => /\.(mp3|wav|ogg)$/i.test(name);

  return (
    <div className="info-page" style={{margin:'24px 0', background:'#fff', borderRadius:8, boxShadow:'0 2px 8px #1a7f3c22', padding:24}}>
      <h2 style={{color:'#1a7f3c'}}>Media Gallery</h2>
      {loading && <div>Loading media...</div>}
      {error && <div style={{color:'red'}}>{error}</div>}
      {!loading && !error && files.length === 0 && <div style={{color:'#888'}}>No media files uploaded yet.</div>}
      <div style={{display:'flex', flexWrap:'wrap', gap:24}}>
        {files.map((file, i) => (
          <div key={file} style={{border:'1px solid #e0e0e0', borderRadius:8, padding:8, background:'#f9f9f9', width:180, textAlign:'center', boxShadow:'0 1px 4px #1a7f3c22'}}>
            <div style={{marginBottom:8, minHeight:100}}>
              {isImage(file) ? (
                <img src={getFileUrl(file)} alt={file} style={{maxWidth:'100%', maxHeight:90, borderRadius:4}} />
              ) : isVideo(file) ? (
                <video src={getFileUrl(file)} controls style={{maxWidth:'100%', maxHeight:90, borderRadius:4}} />
              ) : isAudio(file) ? (
                <audio src={getFileUrl(file)} controls style={{width:'100%'}} />
              ) : (
                <span style={{fontSize:32, color:'#1a7f3c'}}>&#128196;</span>
              )}
            </div>
            <div style={{fontSize:12, wordBreak:'break-all'}}>{file}</div>
            {/* No download or open links for members */}
          </div>
        ))}
      </div>
      <button onClick={onBack} style={{marginTop:32, background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'8px 18px', fontWeight:600, fontSize:'1rem'}}>Back to My Account</button>
    </div>
  );
}

// TeamsPage: Shows Group A and Group B players in lined tables
function TeamsPage({ onBack }) {
  const [parents, setParents] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setLoading(true);
    setError('');
    fetch('http://localhost:5000/api/all-parents')
      .then(res => res.json())
      .then(data => {
        setParents(data.parents || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load players.');
        setLoading(false);
      });
  }, []);

  // Flatten all kids with group info
  const allKids = parents.flatMap(parent =>
    (parent.kids || []).map(kid => ({
      name: kid.name,
      group: kid.group || (new Date().getFullYear() - parseInt(kid.year, 10) >= 10 ? 'A' : 'B'),
      status: kid.status || 'actif',
      parentName: parent.name // Add parent name
    }))
  );
  const groupA = allKids.filter(kid => kid.group === 'A');
  const groupB = allKids.filter(kid => kid.group === 'B');

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: 32,
    background: '#fff',
    fontSize: '1.1rem',
    boxShadow: '0 2px 8px #1a7f3c22',
    border: 'none'
  };
  const thtd = {
    borderBottom: '1.5px solid #1a7f3c',
    borderRight: 'none',
    borderLeft: 'none',
    borderTop: 'none',
    padding: '10px 18px',
    textAlign: 'left',
    background: '#f4f8f6',
    color: '#1a7f3c',
    fontWeight: 600
  };
  const td = {
    borderBottom: '1px solid #e0e0e0',
    borderRight: 'none',
    borderLeft: 'none',
    borderTop: 'none',
    padding: '10px 18px',
    background: '#fff',
    color: '#222',
    fontWeight: 400
  };

  return (
    <div className="info-page" style={{maxWidth:900, margin:'0 auto', background:'#fff', borderRadius:8, boxShadow:'0 2px 8px #1a7f3c22', padding:24}}>
      <h2 style={{color:'#1a7f3c', marginBottom:32}}>Teams</h2>
      {loading && <div>Loading players...</div>}
      {error && <div style={{color:'red'}}>{error}</div>}
      <h3 style={{color:'#1a7f3c', marginTop:0}}>Group A Players (10+ years old)</h3>
      <div style={{marginBottom:8, color:'#1a7f3c', fontWeight:600}}>
        Total: {groupA.length} kid{groupA.length !== 1 ? 's' : ''}
      </div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thtd}>Name</th>
            <th style={thtd}>Group</th>
            <th style={thtd}>Status</th>
            <th style={thtd}>Parent</th>
          </tr>
        </thead>
        <tbody>
          {groupA.length === 0 && <tr><td colSpan={4} style={td}>No players in Group A.</td></tr>}
          {groupA.map((kid, i) => (
            <tr key={i}>
              <td style={td}>{kid.name}</td>
              <td style={td}>{kid.group}</td>
              <td style={td}>{kid.status}</td>
              <td style={td}>{kid.parentName}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{color:'#1a7f3c'}}>Group B Players (&lt;10 years old)</h3>
      <div style={{marginBottom:8, color:'#1a7f3c', fontWeight:600}}>
        Total: {groupB.length} kid{groupB.length !== 1 ? 's' : ''}
      </div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thtd}>Name</th>
            <th style={thtd}>Group</th>
            <th style={thtd}>Status</th>
            <th style={thtd}>Parent</th>
          </tr>
        </thead>
        <tbody>
          {groupB.length === 0 && <tr><td colSpan={4} style={td}>No players in Group B.</td></tr>}
          {groupB.map((kid, i) => (
            <tr key={i}>
              <td style={td}>{kid.name}</td>
              <td style={td}>{kid.group}</td>
              <td style={td}>{kid.status}</td>
              <td style={td}>{kid.parentName}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onBack} style={{marginTop:32, background:'#1a7f3c', color:'#fff', border:'none', borderRadius:4, padding:'8px 18px', fontWeight:600, fontSize:'1rem'}}>Back</button>
    </div>
  );
}

// WeatherPopup component
function WeatherPopup({ loading, error, data, onClose }) {
  // Weather code mapping
  const weatherMap = {
    0: { desc: 'Clear', emoji: '☀️', color: '#ffe066', fun: 'Perfect day for soccer! Don’t forget your shades!' },
    1: { desc: 'Mainly clear', emoji: '🌤️', color: '#ffe066', fun: 'Almost perfect! Maybe bring a cap.' },
    2: { desc: 'Partly cloudy', emoji: '⛅', color: '#b2dffb', fun: 'A little shade never hurt anyone!' },
    3: { desc: 'Overcast', emoji: '☁️', color: '#bfc9ca', fun: 'Cloudy with a chance of nutmegs.' },
    45: { desc: 'Fog', emoji: '🌫️', color: '#d6e0e6', fun: 'Where did the ball go?!' },
    48: { desc: 'Rime fog', emoji: '🌫️', color: '#d6e0e6', fun: 'It’s mysterious out there!' },
    51: { desc: 'Drizzle', emoji: '🌦️', color: '#a3c9f7', fun: 'Dribble in the drizzle!' },
    53: { desc: 'Drizzle', emoji: '🌦️', color: '#a3c9f7', fun: 'Dribble in the drizzle!' },
    55: { desc: 'Drizzle', emoji: '🌦️', color: '#a3c9f7', fun: 'Dribble in the drizzle!' },
    56: { desc: 'Freezing Drizzle', emoji: '❄️', color: '#b2e0f7', fun: 'Brrr! Slide tackle with caution.' },
    57: { desc: 'Freezing Drizzle', emoji: '❄️', color: '#b2e0f7', fun: 'Brrr! Slide tackle with caution.' },
    61: { desc: 'Rain', emoji: '🌧️', color: '#7ec8e3', fun: 'Splash zone! Wear your boots.' },
    63: { desc: 'Rain', emoji: '🌧️', color: '#7ec8e3', fun: 'Splash zone! Wear your boots.' },
    65: { desc: 'Rain', emoji: '🌧️', color: '#7ec8e3', fun: 'Splash zone! Wear your boots.' },
    66: { desc: 'Freezing Rain', emoji: '❄️', color: '#b2e0f7', fun: 'Ice, ice, maybe? Careful out there!' },
    67: { desc: 'Freezing Rain', emoji: '❄️', color: '#b2e0f7', fun: 'Ice, ice, maybe? Careful out there!' },
    71: { desc: 'Snow', emoji: '❄️', color: '#eaf6fb', fun: 'Snowball match, anyone?' },
    73: { desc: 'Snow', emoji: '❄️', color: '#eaf6fb', fun: 'Snowball match, anyone?' },
    75: { desc: 'Snow', emoji: '❄️', color: '#eaf6fb', fun: 'Snowball match, anyone?' },
    77: { desc: 'Snow grains', emoji: '❄️', color: '#eaf6fb', fun: 'Tiny snowballs incoming!' },
    80: { desc: 'Rain showers', emoji: '🌦️', color: '#a3c9f7', fun: 'Showers of goals and rain!' },
    81: { desc: 'Rain showers', emoji: '🌦️', color: '#a3c9f7', fun: 'Showers of goals and rain!' },
    82: { desc: 'Rain showers', emoji: '🌦️', color: '#a3c9f7', fun: 'Showers of goals and rain!' },
    85: { desc: 'Snow showers', emoji: '🌨️', color: '#eaf6fb', fun: 'Let it snow, let it score!' },
    86: { desc: 'Snow showers', emoji: '🌨️', color: '#eaf6fb', fun: 'Let it snow, let it score!' },
    95: { desc: 'Thunderstorm', emoji: '⛈️', color: '#b0b0b0', fun: 'Thunderstruck! Maybe play FIFA instead.' },
    96: { desc: 'Thunderstorm', emoji: '⛈️', color: '#b0b0b0', fun: 'Thunderstruck! Maybe play FIFA instead.' },
    99: { desc: 'Thunderstorm', emoji: '⛈️', color: '#b0b0b0', fun: 'Thunderstruck! Maybe play FIFA instead.' },
  };
  // Helper: Celsius to Fahrenheit
  const toF = c => Math.round((c * 9) / 5 + 32);
  // Helper: km/h to mph
  const toMph = kmh => Math.round(kmh * 0.621371);
  let content;
  if (loading) {
    content = <div style={{fontSize:'1.3rem', color:'#1a7f3c'}}>Fetching weather...</div>;
  } else if (error) {
    content = <div style={{color:'red', fontWeight:600}}>{error}</div>;
  } else if (data) {
    const w = weatherMap[data.weathercode] || { desc: 'Unknown', emoji: '❓', color: '#eee', fun: 'Weather mystery! Play anyway!' };
    content = (
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'3.5rem', marginBottom:8}}>{w.emoji}</div>
        <div style={{fontWeight:700, fontSize:'1.5rem', color:'#1a7f3c'}}>{w.desc}</div>
        <div style={{fontSize:'1.2rem', margin:'8px 0'}}>Temperature: <b>{toF(data.temperature)}°F</b></div>
        <div style={{fontSize:'1.1rem'}}>Wind: <b>{toMph(data.windspeed)} mph</b></div>
        <div style={{marginTop:16, fontWeight:600, color:'#fff', background:'#1a7f3c', borderRadius:8, padding:'10px 18px', fontSize:'1.1rem', boxShadow:'0 2px 8px #1a7f3c44'}}>{w.fun}</div>
      </div>
    );
  }
  return (
    <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'#0008', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}}>
      <div style={{background:data?weatherMap[data.weathercode]?.color||'#fff':'#fff', borderRadius:18, boxShadow:'0 4px 32px #1a7f3c55', padding:'36px 32px 24px 32px', minWidth:320, minHeight:180, position:'relative', border:'4px solid #1a7f3c'}}>
        <button onClick={onClose} style={{position:'absolute', top:10, right:14, background:'none', border:'none', fontSize:'1.5rem', color:'#1a7f3c', cursor:'pointer', fontWeight:700}} title="Close">×</button>
        {content}
      </div>
    </div>
  );
}

export default App;
