const express = require("express");
const swaggerParser = require("swagger-parser");
const multer = require("multer");
const fs = require("fs");
const yaml = require("js-yaml");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

let swaggerDoc = null; // Global variable to store the parsed Swagger document

const isEmptyFile = (filePath) => fs.statSync(filePath).size === 0;

const parseJSON = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error("Invalid JSON format");
  }
};

const parseYAML = (filePath) => {
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error("Invalid YAML format.");
  }
};

const parsers = {
  "application/json": parseJSON,
  "application/x-yaml": parseYAML,
  ".json": parseJSON,
  ".yaml": parseYAML,
};

const getParser = (file) => {
  const mimeTypeParser = parsers[file.mimetype];
  const extensionParser =
    parsers[file.originalname.slice(file.originalname.lastIndexOf("."))];
  return mimeTypeParser || extensionParser;
};

app.post("/swagger", upload.single("swagger"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }

    const filePath = req.file.path;

    if (isEmptyFile(filePath)) {
      return res.status(422).send("Uploaded file is empty.");
    }

    const parse = getParser(req.file);

    if (!parse) {
      return res
        .status(415)
        .send("Unsupported file type. Please upload a JSON or YAML file.");
    }

    try {
      swaggerDoc = parse(filePath);
    } catch (error) {
      return res.status(422).send(`Error: ${error.message}`);
    }

    try {
      const api = await swaggerParser.validate(swaggerDoc);
      const resources = Object.keys(api.paths)
        .map((path) =>
          Object.keys(api.paths[path]).map((method) => ({ path, method }))
        )
        .flat();

      res.json(resources);
    } catch (validationError) {
      return res
        .status(422)
        .send(`Invalid OpenAPI format. ${validationError.message}`);
    }
  } catch (error) {
    res.status(500).send(`Error processing Swagger file: ${error.message}`);
  } finally {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
  }
});

app.post("/parameters", (req, res) => {
  const { path, method } = req.body;

  if (
    !swaggerDoc ||
    !swaggerDoc.paths[path] ||
    !swaggerDoc.paths[path][method]
  ) {
    return res.status(404).send("Resource not found");
  }

  const resource = swaggerDoc.paths[path][method];
  const parameters = resource.parameters || [];

  res.json(parameters);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
