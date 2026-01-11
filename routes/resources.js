const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

// ===== Cloudinary setup =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ===== Multer + Cloudinary storage for raw files (PDF/DOC/DOCX) =====
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "resources",
    allowed_formats: ["pdf", "doc", "docx"],
    resource_type: "raw", // important for non-image files
  },
});

const upload = multer({ storage });

// ===== Get all resources =====
router.get("/all", async (req, res) => {
  try {
    const resources = await pool.query("SELECT * FROM resources ORDER BY id DESC");
    res.json(resources.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Add resource =====
router.post("/add", upload.single("file"), async (req, res) => {
  try {
    const { type, title, description } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "File is required" });

    const size = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    const fileUrl = file.path; // Cloudinary raw URL

    const result = await pool.query(
      `INSERT INTO resources (type, title, description, size, file_url) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [type, title, description, size, fileUrl]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Update resource =====
router.put("/update/:id", upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, description } = req.body;

    // Fetch existing resource
    const existing = await pool.query("SELECT * FROM resources WHERE id=$1", [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: "Resource not found" });

    let query = "UPDATE resources SET type=$1, title=$2, description=$3";
    let values = [type, title, description];
    let paramIndex = 4;

    // If new file uploaded
    if (req.file) {
      // Delete old file from Cloudinary
      if (existing.rows[0].file_url) {
        const publicId = existing.rows[0].file_url
          .split("/resources/")[1]
          .split(".")[0];
        await cloudinary.uploader.destroy(`resources/${publicId}`, { resource_type: "raw" });
      }

      const size = `${(req.file.size / 1024 / 1024).toFixed(2)} MB`;
      const fileUrl = req.file.path;

      query += `, size=$${paramIndex}, file_url=$${paramIndex + 1}`;
      values.push(size, fileUrl);
      paramIndex += 2;
    }

    query += ` WHERE id=$${paramIndex} RETURNING *`;
    values.push(id);

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Delete resource =====
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const resource = await pool.query("SELECT * FROM resources WHERE id=$1", [id]);
    if (!resource.rows[0]) return res.status(404).json({ error: "Resource not found" });

    // Delete file from Cloudinary
    if (resource.rows[0].file_url) {
      const publicId = resource.rows[0].file_url
        .split("/resources/")[1]
        .split(".")[0];
      await cloudinary.uploader.destroy(`resources/${publicId}`, { resource_type: "raw" });
    }

    await pool.query("DELETE FROM resources WHERE id=$1", [id]);
    res.json({ message: "Resource deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
