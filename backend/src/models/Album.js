const mongoose = require('mongoose');

const albumSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, default: null },
    releaseDate: { type: String, default: null },
    image: { type: String, default: null },
    url: { type: String, default: null },
    totalTracks: { type: Number, default: null },
    artistId: { type: String, index: true, default: null },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.models.Album || mongoose.model('Album', albumSchema);
