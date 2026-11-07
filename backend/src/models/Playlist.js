const mongoose = require('mongoose');

const TrackSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    uri: { type: String, default: null },
    artists: [{ type: String }],
    album: {
      id: { type: String, default: null },
      name: { type: String, default: null },
      image: { type: String, default: null },
    },
    url: { type: String, default: null },
    durationMs: { type: Number, default: null },
  },
  { _id: false }
);

const PlaylistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    tracks: [TrackSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Playlist', PlaylistSchema);
