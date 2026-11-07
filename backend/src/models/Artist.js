const mongoose = require('mongoose');

const artistSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, default: null },
    image: { type: String, default: null },
    url: { type: String, default: null },
    searchText: { type: String, index: true },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.models.Artist || mongoose.model('Artist', artistSchema);
