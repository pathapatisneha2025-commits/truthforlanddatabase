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

// ===== Storage (Images for blog) =====
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "landblogs", // optional but cleaner to match table
    resource_type: "image",
  },
});

const upload = multer({ storage });


// ================= GET ALL BLOGS =================
router.get("/all", async (req, res) => {
  try {
    const blogs = await pool.query("SELECT * FROM landblogs ORDER BY id DESC");
    res.json(blogs.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// ================= ADD BLOG =================
router.post("/add", upload.single("image"), async (req, res) => {
  try {
    const { category, type, title, slug, date, read_time, content } = req.body;

    if (!title || !slug || !category) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: "Image is required" });

    const imageUrl = file.path;
    const publicId = file.filename;

    const result = await pool.query(
      `INSERT INTO landblogs 
      (category, type, title, slug, date, read_time, image_url, public_id, content)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [category, type, title, slug, date, read_time, imageUrl, publicId, content]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);

    // handle duplicate slug
    if (err.code === "23505") {
      return res.status(400).json({ error: "Slug already exists" });
    }

    res.status(500).json({ error: "Server error" });
  }
});
// ================= GET BLOG BY ID =================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM landblogs WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Blog not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= UPDATE BLOG =================
router.put("/update/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { category, type, title, slug, date, read_time, content } = req.body;

    const existing = await pool.query("SELECT * FROM landblogs WHERE id=$1", [id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Blog not found" });
    }

    let query = `
      UPDATE landblogs 
      SET category=$1, type=$2, title=$3, slug=$4, date=$5, read_time=$6, content=$7
    `;
    let values = [category, type, title, slug, date, read_time, content];
    let paramIndex = 8;

    if (req.file) {
      // delete old image
      if (existing.rows[0].public_id) {
        await cloudinary.uploader.destroy(`landblogs/${existing.rows[0].public_id}`);
      }

      const imageUrl = req.file.path;
      const publicId = req.file.filename;

      query += `, image_url=$${paramIndex}, public_id=$${paramIndex + 1}`;
      values.push(imageUrl, publicId);
      paramIndex += 2;
    }

    query += ` WHERE id=$${paramIndex} RETURNING *`;
    values.push(id);

    const result = await pool.query(query, values);
    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);

    if (err.code === "23505") {
      return res.status(400).json({ error: "Slug already exists" });
    }

    res.status(500).json({ error: "Server error" });
  }
});


// ================= DELETE BLOG =================
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await pool.query("SELECT * FROM landblogs WHERE id=$1", [id]);
    if (!blog.rows[0]) {
      return res.status(404).json({ error: "Blog not found" });
    }

    // delete image from Cloudinary
    if (blog.rows[0].public_id) {
      await cloudinary.uploader.destroy(`landblogs/${blog.rows[0].public_id}`);
    }

    await pool.query("DELETE FROM landblogs WHERE id=$1", [id]);

    res.json({ message: "Blog deleted" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;