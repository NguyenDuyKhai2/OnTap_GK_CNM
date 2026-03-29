const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");
const { DynamoDBDocument } = require("@aws-sdk/lib-dynamodb");

const info = {
    region : "ap-southeast-1",
    credentials : {
        accessKeyId : "",
        secretAccessKey : "",
    },
};

const s3Client = new S3Client(info) ;
const dynamoDbClient = DynamoDBDocument.from(new DynamoDBClient(info)) ;
module.exports = {
    s3Client, dynamoDbClient
} ;
