const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB connection
mongoose.connect('mongodb+srv://mongodb:Mymongodb25@clusterisc.bxzrrw4.mongodb.net/?retryWrites=true&w=majority&appName=ClusterISC', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  password: String,
  kids: [
    {
      name: String,
      year: String
    }
  ],
  blocked: { type: Boolean, default: false },
  blockReason: { type: String, default: '' }
});

const User = mongoose.model('User', userSchema);

// Register endpoint
app.post('/api/register', async (req, res) => {
  const { name, phone, password } = req.body;
  try {
    const user = new User({ name, phone, password, kids: [] });
    await user.save();
    res.status(201).json({ message: 'User registered successfully', user: { name: user.name, phone: user.phone, kids: user.kids } });
  } catch (err) {
    res.status(400).json({ error: 'Registration failed', details: err });
  }
});

// Sign in endpoint
app.post('/api/signin', async (req, res) => {
  const { phone, password } = req.body;
  try {
    const user = await User.findOne({ phone, password });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.blocked) {
      return res.status(403).json({ error: 'User is blocked', blockReason: user.blockReason || 'No reason provided.' });
    }
    res.json({ message: 'Sign in successful', user: { name: user.name, phone: user.phone, kids: user.kids } });
  } catch (err) {
    res.status(500).json({ error: 'Sign in failed', details: err });
  }
});

// Add or update kids for a user
app.post('/api/user/kids', async (req, res) => {
  const { phone, kids } = req.body;
  try {
    const user = await User.findOneAndUpdate(
      { phone },
      { kids },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Kids updated', kids: user.kids });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update kids', details: err });
  }
});

// Update member info (user self-update)
app.post('/api/user/update', async (req, res) => {
  const { phone, name, newPhone, password } = req.body;
  try {
    const updateFields = { name };
    if (newPhone) updateFields.phone = newPhone;
    if (typeof password === 'string') updateFields.password = password;
    const user = await User.findOneAndUpdate(
      { phone },
      updateFields,
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Member info updated', user: { name: user.name, phone: user.phone, kids: user.kids } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update member info', details: err });
  }
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  const { name, email, body } = req.body;
  // Configure your email transport (using Gmail for example)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'hassandev203@gmail.com', // your email
      pass: 'YOUR_APP_PASSWORD' // use an app password, not your main password
    }
  });

  const mailOptions = {
    from: email,
    to: 'hassandev203@gmail.com',
    subject: `Contact from ${name}`,
    text: `${body}\n\nReply to: ${email}`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'Email sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email', details: err });
  }
});

// Get all kids from all users
app.get('/api/all-kids', async (req, res) => {
  try {
    // Fetch all users with their kids and names
    const users = await User.find({});
    // Flatten all kids and attach parent name
    const allKids = users.flatMap(u =>
      (Array.isArray(u.kids) ? u.kids : []).map(kid => ({
        ...kid,
        parent: u.name || u.phone || 'Unknown'
      }))
    );
    res.json({ kids: allKids });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch kids' });
  }
});

// --- ADMIN ENDPOINTS ---

// Get all parents (users except admin)
app.get('/api/all-parents', async (req, res) => {
  try {
    const users = await User.find({ phone: { $ne: 'admin' } });
    res.json({ parents: users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch parents.' });
  }
});

// Update parent info (name, phone, password, blocked, blockReason)
app.post('/api/admin/update-parent', async (req, res) => {
  const { _id, name, phone, password, blocked, blockReason } = req.body;
  if (!_id || !name || !phone) return res.status(400).json({ error: 'Missing fields.' });
  try {
    const updateFields = { name, phone };
    if (typeof password === 'string') updateFields.password = password;
    if (typeof blocked === 'boolean') updateFields.blocked = blocked;
    if (typeof blockReason === 'string') updateFields.blockReason = blockReason;
    const user = await User.findByIdAndUpdate(_id, updateFields, { new: true });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update parent.' });
  }
});

// Update a kid for a parent
app.post('/api/admin/update-kid', async (req, res) => {
  const { parentPhone, kid } = req.body;
  if (!parentPhone || !kid || !kid.name || !kid.year) return res.status(400).json({ error: 'Missing fields.' });
  try {
    const user = await User.findOne({ phone: parentPhone });
    if (!user) return res.status(404).json({ error: 'Parent not found.' });
    const idx = (user.kids || []).findIndex(k => k._id?.toString() === kid._id || (k.name === kid.name && k.year === kid.year));
    if (idx === -1) return res.status(404).json({ error: 'Kid not found.' });
    user.kids[idx].name = kid.name;
    user.kids[idx].year = kid.year;
    await user.save();
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update kid.' });
  }
});

// Delete user (admin only)
app.delete('/api/admin/delete-user', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required.' });
  try {
    const deleted = await User.findOneAndDelete({ phone });
    if (!deleted) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// --- MEDIA UPLOAD (ADMIN) ---
const mediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage: mediaStorage });

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.post('/api/admin/upload-media', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ success: true, filename: req.file.filename, url: `/uploads/${req.file.filename}` });
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// List uploaded media files for gallery
app.get('/uploads', (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  fs.readdir(uploadsDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to list files' });
    // Filter out hidden files and folders
    const visibleFiles = files.filter(f => !f.startsWith('.'));
    res.json({ files: visibleFiles });
  });
});

// Delete media file endpoint
app.delete('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete file' });
    }
    res.json({ success: true });
  });
});

// Chat message schema
const chatMessageSchema = new mongoose.Schema({
  sender: String, // phone or 'admin'
  receiver: String, // phone or 'group' for group chat
  message: String,
  timestamp: { type: Date, default: Date.now }
});
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

// Socket.IO logic
io.on('connection', (socket) => {
  // Join personal room for private chat
  socket.on('join', (userPhone) => {
    socket.join(userPhone);
  });
  // Group chat join
  socket.on('joinGroup', () => {
    socket.join('group');
  });
  // Send message (group or private)
  socket.on('chatMessage', async (data) => {
    const { sender, receiver, message } = data;
    const chatMsg = new ChatMessage({ sender, receiver, message });
    await chatMsg.save();
    if (receiver === 'group') {
      io.to('group').emit('chatMessage', chatMsg);
    } else {
      io.to(receiver).emit('chatMessage', chatMsg);
      io.to(sender).emit('chatMessage', chatMsg); // echo to sender
    }
  });
});

// Fetch chat history (group or private)
app.get('/api/chat/history', async (req, res) => {
  const { user1, user2, group } = req.query;
  try {
    let messages;
    if (group) {
      messages = await ChatMessage.find({ receiver: 'group' }).sort({ timestamp: 1 });
    } else if (user1 && user2) {
      messages = await ChatMessage.find({
        $or: [
          { sender: user1, receiver: user2 },
          { sender: user2, receiver: user1 }
        ]
      }).sort({ timestamp: 1 });
    } else {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Forgot password endpoint: send password to user's phone (simulate SMS)
app.post('/api/forgot-password', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required.' });
  try {
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    // Simulate sending SMS by logging to console (replace with real SMS API in production)
    console.log(`SMS to ${phone}: Your Islamic Soccer Club password is: ${user.password}`);
    // Optionally, send via email if user has email field
    res.json({ message: 'Password sent to your phone number.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send password.' });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
\n// Touch for GitHub visibility
