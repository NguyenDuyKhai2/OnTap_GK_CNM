const { v4: uuidv4 } = require("uuid");

const { dynamoDbClient, s3Client } = require("../config/aws-config");

const {
  ScanCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

// =========================
// CẤU HÌNH DỄ ĐỔI THEO ĐỀ
// =========================
const TABLE_NAME = "EventTickets";
const BUCKET_NAME = "events-s3-dynamodb";
const AWS_REGION = "ap-southeast-1";

// khóa chính trong bảng
const PRIMARY_KEY = "ticketId"; 
// nếu đề yêu cầu ticketId / productId / studentId thì đổi ở đây

// tên field ảnh
const IMAGE_FIELD = "imageUrl";

// =========================    
// HELPER
// =========================
const buildImageUrl = (key) => {
  return `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

const getS3KeyFromUrl = (url) => {
  if (!url) return null;
  return url.split("/").pop();
};

const normalizeData = (body, existingItem = {}) => {
  const data = {
    ...existingItem,
    ...body,
  };

  if (data.quantity !== undefined) data.quantity = Number(data.quantity);
  if (data.pricePerTicket !== undefined) data.pricePerTicket = Number(data.pricePerTicket);

  return data;
};

const validateData = (data) => {
  const errors = [];

  if (!data.eventName || data.eventName.trim() === "") {
    errors.push("Tên sự kiện không được để trống");
  }

  if (!data.holderName || data.holderName.trim() === "") {
    errors.push("Tên người sở hữu không được để trống");
  }

  const validCategories = ["Standard", "VIP", "VVIP"];
  if (!validCategories.includes(data.category)) {
    errors.push("Category phải là Standard, VIP hoặc VVIP");
  }

  if (isNaN(data.quantity) || data.quantity <= 0) {
    errors.push("Số lượng phải lớn hơn 0");
  }

  if (isNaN(data.pricePerTicket) || data.pricePerTicket <= 0) {
    errors.push("Giá vé phải lớn hơn 0");
  }

  const validStatuses = ["Upcoming", "Sold", "Cancelled"];
  if (!validStatuses.includes(data.status)) {
    errors.push("Status phải là Upcoming, Sold hoặc Cancelled");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inputDate = new Date(data.eventDate);
  if (!data.eventDate || isNaN(inputDate.getTime()) || inputDate < today) {
    errors.push("Ngày sự kiện không được nhỏ hơn ngày hiện tại");
  }

  if (errors.length > 0) {
    throw new Error(errors.join(", "));
  }
};

const applyBusinessLogic = (data) => {
  const quantity = Number(data.quantity) || 0;
  const pricePerTicket = Number(data.pricePerTicket) || 0;

  data.totalAmount = quantity * pricePerTicket;

  let discountRate = 0;

  if (data.category === "VIP" && quantity >= 4) {
    discountRate = 0.1;
  } else if (data.category === "VVIP" && quantity >= 2) {
    discountRate = 0.15;
  }

  data.discountRate = discountRate;
  data.finalAmount = data.totalAmount * (1 - discountRate);
  data.isDiscount = discountRate > 0;
  data.discountLabel = data.isDiscount ? "Được giảm giá" : "Không giảm giá";

  return data;
};

const uploadFileToS3 = async (file) => {
  if (!file) return null;

  const key = `${Date.now()}-${file.originalname}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return buildImageUrl(key);
};

const deleteFileFromS3ByUrl = async (url) => {
  const key = getS3KeyFromUrl(url);
  if (!key) return;

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );
};

// =========================
// CRUD
// =========================
const getAllItems = async (keyword = "", status = "All") => {
  const params = {
    TableName: TABLE_NAME,
  };

  const filterConditions = [];
  const expressionAttributeValues = {};
  const expressionAttributeNames = {};

  if (keyword && keyword.trim() !== "") {
    filterConditions.push(
      "(contains(eventName, :keyword) OR contains(holderName, :keyword))"
    );
    expressionAttributeValues[":keyword"] = keyword.trim();
  }

  if (status && status !== "All") {
    filterConditions.push("#status = :status");
    expressionAttributeNames["#status"] = "status";
    expressionAttributeValues[":status"] = status;
  }

  if (filterConditions.length > 0) {
    params.FilterExpression = filterConditions.join(" AND ");
    params.ExpressionAttributeValues = expressionAttributeValues;
  }

  if (Object.keys(expressionAttributeNames).length > 0) {
    params.ExpressionAttributeNames = expressionAttributeNames;
  }

  const result = await dynamoDbClient.send(new ScanCommand(params));
  return result.Items || [];
};

const getItemById = async (id) => {
  const result = await dynamoDbClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { [PRIMARY_KEY]: id },
    })
  );

  return result.Item || null;
};

const saveItem = async (id, body, file) => {
  let existingItem = null;

  if (id) {
    existingItem = await getItemById(id);
    if (!existingItem) {
      throw new Error("Không tìm thấy dữ liệu để cập nhật");
    }
  }

  let item = normalizeData(body, existingItem || {});

  item[PRIMARY_KEY] = id || body.itemId || uuidv4();

  if (!id) {
    item.createdAt = new Date().toISOString();
  }

  item.updatedAt = new Date().toISOString();

  validateData(item);

  if (file) {
    const newImageUrl = await uploadFileToS3(file);

    if (existingItem && existingItem[IMAGE_FIELD]) {
      await deleteFileFromS3ByUrl(existingItem[IMAGE_FIELD]);
    }

    item[IMAGE_FIELD] = newImageUrl;
  } else if (existingItem && existingItem[IMAGE_FIELD]) {
    item[IMAGE_FIELD] = existingItem[IMAGE_FIELD];
  }

  item = applyBusinessLogic(item);

  await dynamoDbClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  return item;
};

const deleteItemById = async (id) => {
  const existingItem = await getItemById(id);

  if (!existingItem) {
    throw new Error("Không tìm thấy dữ liệu để xóa");
  }

  if (existingItem[IMAGE_FIELD]) {
    await deleteFileFromS3ByUrl(existingItem[IMAGE_FIELD]);
  }

  await dynamoDbClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { [PRIMARY_KEY]: id },
    })
  );
};

module.exports = {
  getAllItems,
  getItemById,
  saveItem,
  deleteItemById,
};