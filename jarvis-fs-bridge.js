/* =====================================================
   JARVIS FILESYSTEM BRIDGE V1
===================================================== */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());

app.use(express.json({
    limit: "25mb"
}));

const ROOT = process.cwd();

console.log(
    "🧠 [FS_BRIDGE_ROOT]:",
    ROOT
);

/* =====================================================
   WRITE FILE
===================================================== */

app.post("/write", async (req, res) => {

    try {

        const {
            file,
            content
        } = req.body || {};

        if (!file) {
            throw new Error(
                "FILE_REQUIRED"
            );
        }

        const safePath =
            path.join(ROOT, file);

        console.log(
            "🧠 [WRITE_REQUEST]:",
            safePath
        );

        // 🔥 crear carpetas
        fs.mkdirSync(
            path.dirname(safePath),
            {
                recursive: true
            }
        );

        // 🔥 escribir archivo
        fs.writeFileSync(
            safePath,
            content || "",
            "utf8"
        );

        console.log(
            "✅ [FILE_WRITTEN]:",
            safePath
        );

        return res.json({
            ok: true,
            path: safePath
        });

    } catch (err) {

        console.error(
            "❌ [FS_BRIDGE_ERROR]:",
            err
        );

        return res.status(500).json({
            ok: false,
            error: err.message
        });
    }
});

/* =====================================================
   SERVER
===================================================== */

const PORT = 3344;

app.listen(PORT, () => {

    console.log(
        `🧠 FS BRIDGE ONLINE → http://localhost:${PORT}`
    );
});