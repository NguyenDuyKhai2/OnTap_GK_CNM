const {
  getAllItems,
  getItemById,
  saveItem,
  deleteItemById,
} = require("../service/ticket-service");

const renderIndex = async (req, res) => {
  try {
    const { keyword = "", status = "All" } = req.query;
    const items = await getAllItems(keyword, status);

    res.render("index", {
      items,
      keyword,
      status,
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
};

const renderForm = async (req, res) => {
  try {
    const { ticketId } = req.params;
    let item = null;

    if (ticketId) {
      item = await getItemById(ticketId);
      if (!item) {
        return res.status(404).send("Không tìm thấy dữ liệu");
      }
    }

    res.render("form", {
      item,
      error: null,
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
};

const handleSave = async (req, res) => {
  const { ticketId } = req.params;

  try {
    await saveItem(ticketId, req.body, req.file);
    res.redirect("/");
  } catch (error) {
    res.status(400).render("form", {
      item: {
        itemId: ticketId || req.body.itemId,
        ...req.body,
      },
      error: error.message,
    });
  }
};

const handleDelete = async (req, res) => {
  try {
    await deleteItemById(req.params.ticketId);
    res.redirect("/");
  } catch (error) {
    res.status(500).send(error.message);
  }
};

module.exports = {
  renderIndex,
  renderForm,
  handleSave,
  handleDelete,
};