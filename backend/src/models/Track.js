const mongoose = require('mongoose');

// Se usa el id de Spotify como `_id`: así la unicidad la garantiza MongoDB
// por sí mismo y los upserts funcionan aunque se borre la base y los índices
// todavía no existan.
const trackSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, default: null },
    uri: { type: String, default: null },
    artists: { type: [String], default: [] },
    album: {
      type: new mongoose.Schema(
        { id: String, name: String, image: String },
        { _id: false }
      ),
      default: null,
    },
    url: { type: String, default: null },
    durationMs: { type: Number, default: null },
    searchText: { type: String, index: true },
  },
  { timestamps: true, versionKey: false }
);

trackSchema.index({ 'album.id': 1 });

module.exports = mongoose.models.Track || mongoose.model('Track', trackSchema);
