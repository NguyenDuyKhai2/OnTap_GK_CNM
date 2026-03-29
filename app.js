const express = require("express");
const multer = require("multer");
const {
  renderIndex,
  renderForm,
  handleSave,
  handleDelete,
} = require("./controller/ticket-controller");
const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
const upload = multer({ storage: multer.memoryStorage() });

// View
app.set("view engine", "ejs");
app.set("views", "./views");

// View Route
app.get("/", renderIndex);
app.get("/add", renderForm);
app.get("/edit/:ticketId", renderForm);

// Api Route
app.post("/add", upload.single("image"), handleSave);
app.post(
  "/edit/:ticketId",
  upload.single("image"),
  handleSave,
);
app.post("/delete/:ticketId", handleDelete);

// Listen
app.listen(3000, () => {
  console.log("Server on");
});