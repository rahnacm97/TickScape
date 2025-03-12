const User = require('../../models/userSchema');
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon=require("../../models/couponSchema");
const CustomError = require('../../utils/customError');
const mongodb = require("mongodb");
const env = require("dotenv").config();
const crypto = require("crypto");
const { v4: uuidv4 } = require('uuid');
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const ExcelJS = require("exceljs");
//const PDFDocument = require("pdfkit");
const PDFDocument = require('pdfkit-table');
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");

//Function to calculate the order Details
const fetchSalesData = async (filterType = "daily", startDatee, endDatee, page = 1, limit = null) => {
  let queryStartDate, queryEndDate;
  const now = new Date();

  switch (filterType) {
    case "daily":
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      queryStartDate = new Date(today); 
      queryStartDate.setHours(0, 0, 0, 0);
      queryEndDate = new Date(today);
      queryEndDate.setHours(23, 59, 59, 999);
      break;
    case "weekly":
      queryStartDate = new Date(now);
      queryStartDate.setDate(now.getDate() - 6);
      queryStartDate.setHours(0, 0, 0, 0);
      queryEndDate = new Date(now);
      queryEndDate.setHours(23, 59, 59, 999);
      break;
    case "monthly":
      queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      queryEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case "custom":
      if (!startDatee || !endDatee) throw new Error("Both start and end dates are required for custom filter");
      queryStartDate = new Date(startDatee);
      queryEndDate = new Date(endDatee);
      queryEndDate.setHours(23, 59, 59, 999);
      break;
    default:
      throw new Error("Invalid filter type");
  }

  const query = { createdOn: { $gte: queryStartDate, $lte: queryEndDate } };
  console.log("fetchSalesData Query:", JSON.stringify(query, null, 2));

  const userCount = await User.countDocuments({ isAdmin: false });

  const totalSales = await Order.aggregate([
    { $match: { status: { $nin: ["Cancelled", "Returned"] }, ...query } },
    { $unwind: "$orderedItems" },
    { $match: { "orderedItems.orderStatus": { $nin: ["Cancelled", "Returned"] } } },
    {
      $group: {
        _id: "$_id",
        activeAmount: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
        shipping: { $first: "$shipping" },
        discount: { $first: "$discount" },
        quantity: { $sum: "$orderedItems.quantity" },
        couponDiscount: { $first: "$couponDiscount" || 0 }
      }
    },
    {
      $group: {
        _id: null,
        totalBaseAmount: { $sum: "$activeAmount" },
        totalShipping: { $sum: "$shipping" },
        totalDiscount: { $sum: "$discount" },
        totalOrder: { $sum: 1 },
        itemSold: { $sum: "$quantity" },
        totalCouponDiscount: { $sum: "$couponDiscount" }
      }
    },
    {
      $project: {
        totalAmount: {
          $add: [
            "$totalBaseAmount",
            { $multiply: ["$totalBaseAmount", 0.18] },
            "$totalShipping",
            { $multiply: ["$totalDiscount", -1] }
          ]
        },
        totalOrder: 1,
        totalDiscountPrice: "$totalDiscount",
        itemSold: 1,
        totalCouponDiscount: 1
      }
    }
  ]);

  const salesData = totalSales[0] || {
    totalAmount: 0,
    totalOrder: 0,
    totalDiscountPrice: 0,
    itemSold: 0,
    totalCouponDiscount: 0
  };

  const processingOrders = await Order.countDocuments({ status: "Order Placed", ...query });

  const totalCouponUsers = await Order.aggregate([
    { $match: { couponApplied: true, ...query } },
    { $count: "totalCouponApplied" }
  ]);

  const totalCouponCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalCouponApplied : 0;

  const totalAllOrders = await Order.countDocuments(query);
  const totalCancelledOrders = await Order.countDocuments({ status: "Cancelled", ...query });
  const totalReturnedOrders = await Order.countDocuments({ status: "Returned", ...query });

  const count = await Order.countDocuments(query);
  const totalPage = limit ? Math.max(Math.ceil(count / limit), 1) : 1;
  const skip = limit ? (page - 1) * limit : 0;

  const order = await Order.find(query).sort({ createdOn: -1 }).limit(limit).skip(skip);

  return {
    ...salesData,
    userCount,
    processingOrders,
    order,
    totalCouponUsers: totalCouponCount,
    totalPage,
    currentPage: page,
    startDatee: queryStartDate.toISOString().split("T")[0],
    endDatee: queryEndDate.toISOString().split("T")[0],
    filterType,
    totalAllOrders,
    totalCancelledOrders,
    totalReturnedOrders
  };
};


//Load sales data in tables
const getSalesReport = async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const limit = 10;
      const filterType = req.query.filterType || "daily";
      const startDatee = req.query.startDatee;
      const endDatee = req.query.endDatee;
  
      if (filterType === "custom" && (!startDatee || !endDatee)) {
        throw new CustomError("Start and end dates are required for custom filter", 400);
      }
  
      const result = await fetchSalesData(filterType, startDatee, endDatee, page, limit);
  
      
      console.log("Fetched sales data:", result);
  
      if (req.xhr || req.headers.accept.includes('application/json')) {
        return res.json({
          order: result.order,
          totalPage: result.totalPage,
          currentPage: page,
          filterType: result.filterType,
          startDatee: result.startDatee,
          endDatee: result.endDatee
        });
      }
  
      res.render("salesReport", {
        ...result,
        startDatee: req.query.startDatee || "",
        endDatee: req.query.endDatee || "",
        limit,
      });
    } catch (error) {
      console.error("Error in getSalesReport:", error.stack); 
      if (req.xhr || req.headers.accept.includes('application/json')) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
      res.redirect("/pageerror");
    }
};

//Sales Report
const salesReport = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 10; 
      const filterType = req.query.filterType || "daily"; 
      const startDatee = req.query.startDatee;
      const endDatee = req.query.endDatee;
  
      const result = await fetchSalesData(filterType, startDatee, endDatee, page, limit);
      res.json(result);
    } catch (error) {
      console.error("Sales report error:", error);
      res.status(500).json({ error: "Server error", details: error.message });
    }
};

//Excel Details
const downloadExcelReport = async (req, res) => {
    try {
      const { startDate, endDate, filterType = "custom" } = req.body; 
       
      const salesData = await fetchSalesData(filterType, startDate, endDate, 1, null);
  
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sales Report");
  
      worksheet.mergeCells("A1:J1");
      const headerCell = worksheet.getCell("A1");
      headerCell.value = `Sales Report from ${salesData.startDatee} to ${salesData.endDatee}`;
      headerCell.font = { bold: true, size: 20, color: { argb: "FFFFFF" } };
      headerCell.alignment = { horizontal: "center", vertical: "middle" };
      headerCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "4F81BD" },
      };
  
      worksheet.getRow(1).height = 30;
      worksheet.addRow([]);
  
      const orderDetailsHeaderRow = worksheet.addRow([
        "Order ID",
        "User ID",
        "Total Price",
        "GST Amount",
        "Discount",
        "Shipping",
        "Final Amount",
        "Status",
        "Payment Method",
        "Order Date",
      ]);
  
      orderDetailsHeaderRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC000" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
  
      worksheet.columns = [
        { key: "orderId", width: 15 },
        { key: "userId", width: 15 },
        { key: "totalPrice", width: 15 },
        { key: "gstAmount", width: 15 },
        { key: "discount", width: 15 },
        { key: "shipping", width: 15 },
        { key: "finalAmount", width: 15 },
        { key: "status", width: 15 },
        { key: "paymentMethod", width: 15 },
        { key: "invoiceDate", width: 20 },
      ];
  
      salesData.order.forEach((order) => {
        const row = worksheet.addRow([
          order.orderId || order._id,
          order.userId,
          order.totalPrice,
          order.gstAmount,
          order.discount,
          order.shipping,
          order.finalAmount,
          order.status,
          order.paymentMethod,
          new Date(order.invoiceDate),
        ]);
        const dateCell = row.getCell(10);
        dateCell.numFmt = "dd-mm-yyyy";
      });
  
      worksheet.addRow([]);
      worksheet.addRow(["Summary"]).font = { bold: true, size: 14 };
      const summaryHeaderRow = worksheet.addRow([
      "Total Orders", "Total Cancelled Orders",
      "Total Returned Orders", "Total Orders (Non-Cancelled/Returned)", "Total Sales Amount", "Total Coupon Discount",
      "Total Discount Price", "Items Sold", 
      ]);
  
      summaryHeaderRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "70AD47" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
  
      worksheet.addRow([
        salesData.totalAllOrders,      
        salesData.totalCancelledOrders,
        salesData.totalReturnedOrders,
        salesData.totalOrder,
        salesData.totalAmount.toFixed(2),    
        salesData.totalCouponDiscount,
        salesData.totalDiscountPrice.toFixed(2),
        salesData.itemSold,
      ]);
  
      const reportsDir = "D:\\BROTOTYPE\\TICKSCAPE\\public\\sales_reports";
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
  
      const filePath = path.join(
        reportsDir,
        `TickScape-sales-report-${salesData.startDatee}-${salesData.endDatee}.xlsx`
      );
  
      await workbook.xlsx.writeFile(filePath);
      res.download(filePath, `TickScape-sales-report-${salesData.startDatee}-${salesData.endDatee}.xlsx`);
    } catch (error) {
      console.error("Error generating Excel report:", error);
      res.status(500).json({ error: "Failed to generate Excel report" });
    }
};

//Pdf download and details
const downloadPDFReport = async (req, res) => {
    try {
      const { startDate, endDate, filterType = "custom" } = req.body;
  
      // Fetch all data
      const salesData = await fetchSalesData(filterType, startDate, endDate, 1, null);
  
      const reportsDir = "D:\\BROTOTYPE\\TICKSCAPE\\public\\sales_reports";
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
  
      const filePath = path.join(
        reportsDir,
        `TickScape-sales-report-${salesData.startDatee}-${salesData.endDatee}.pdf`
      );
  
      const doc = new PDFDocument();
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);
  
      // Header
      doc.fontSize(20).text(
        `Sales Report from ${salesData.startDatee} to ${salesData.endDatee}`,
        { align: "center" }
      ).moveDown();
  
      // Order Details Table
      doc.fontSize(12).text("Order Details", { align: "center" }).moveDown();
  
      const formatDate = (isoDate) => {
        const date = new Date(isoDate);
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      };
  
      const orderTable = {
        headers: [
          "Order ID", "User ID", "Total Price", "GST Amount", "Discount", "Shipping",
          "Final Amount", "Status", "Payment Method", "Order Date",
        ],
        rows: salesData.order.map((order) => [
          order.orderId || order._id, order.userId.toString().slice(-8), order.totalPrice.toFixed(2), order.gstAmount.toFixed(2),
          order.discount.toFixed(2), order.shipping.toFixed(2), order.finalAmount.toFixed(2), order.status,
          order.paymentMethod, formatDate(order.invoiceDate),
        ]),
      };
  
      await doc.table(orderTable, {
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
        prepareRow: (row, indexColumn, indexRow, rectRow) => doc.font("Helvetica").fontSize(8),
        width: 500,
        padding: 2,
      });
  
      // Summary Table
      doc.moveDown().fontSize(14).text("Summary", { align: "center" }).moveDown();
  
      const summaryTable = {
        headers: ["Metric", "Value"],
        rows: [
          ["Total Orders", salesData.totalAllOrders],
          ["Total Cancelled Orders", salesData.totalCancelledOrders],
          ["Total Returned Orders", salesData.totalReturnedOrders],
          ["Total Orders (Non-Cancelled/Returned)", salesData.totalOrder],
          ["Total Sales Amount", salesData.totalAmount.toFixed(2)],
          ["Total Coupon Discount", salesData.totalCouponDiscount],
          ["Total Discount Price", salesData.totalDiscountPrice.toFixed(2)],
          ["Items Sold", salesData.itemSold],
        ],
      };
  
      await doc.table(summaryTable, {
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(12),
        prepareRow: (row, indexColumn, indexRow, rectRow) => doc.font("Helvetica").fontSize(10),
        width: 300, 
        padding: 5, 
        columnWidths: [500, 500], 
      });
  
      doc.end();
  
      writeStream.on("finish", () => {
        res.download(
          filePath,
          `TickScape-sales-report-${salesData.startDatee}-${salesData.endDatee}.pdf`,
          (err) => {
            if (err) {
              console.error("Error sending file:", err);
              res.status(500).json({ error: "Failed to download PDF report" });
            }
          }
        );
      });
  
      writeStream.on("error", (err) => {
        console.error("Error writing PDF file:", err);
        res.status(500).json({ error: "Failed to generate PDF report" });
      });
    } catch (error) {
      console.error("Error generating PDF report:", error.stack);
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
};



module.exports = {
    salesReport,
    downloadExcelReport,
    downloadPDFReport,
    getSalesReport
}

