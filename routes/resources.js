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
  params: (req, file) => ({
    folder: "resources",
    resource_type: "raw", // crucial for non-image files
  }),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, DOC, DOCX allowed."));
    }
  },
});

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

    const fileUrl = file.path; // ✅ use directly
    const publicId = file.filename;
    const size = file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Unknown size";

    const result = await pool.query(
      `INSERT INTO resources (type, title, description, size, file_url, public_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [type, title, description, size, fileUrl, publicId]
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

    const existing = await pool.query("SELECT * FROM resources WHERE id=$1", [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: "Resource not found" });

    let query = "UPDATE resources SET type=$1, title=$2, description=$3";
    let values = [type, title, description];
    let paramIndex = 4;

    if (req.file) {
      // Delete old file from Cloudinary
      if (existing.rows[0].public_id) {
        await cloudinary.uploader.destroy(`resources/${existing.rows[0].public_id}`, { resource_type: "raw" });
      }

      const fileUrl = req.file.path; // ✅ use directly, do NOT append extension
      const publicId = req.file.filename;
      const size = req.file.size ? `${(req.file.size / 1024 / 1024).toFixed(2)} MB` : "Unknown size";

      query += `, size=$${paramIndex}, file_url=$${paramIndex + 1}, public_id=$${paramIndex + 2}`;
      values.push(size, fileUrl, publicId);
      paramIndex += 3;
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
    if (resource.rows[0].public_id) {
      await cloudinary.uploader.destroy(`resources/${resource.rows[0].public_id}`, { resource_type: "raw" });
    }

    await pool.query("DELETE FROM resources WHERE id=$1", [id]);
    res.json({ message: "Resource deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
