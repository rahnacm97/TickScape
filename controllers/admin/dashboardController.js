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


// const loadDashboard = async (req,res) => {
//     if(req.session.admin){  
//       try {

//         let page = parseInt(req.query.page) || 1;
//             let limit = 10;
//             let skip = (page - 1) * limit;

//           const userCount = await User.countDocuments();
//           //console.log(userCount);
//           const totalSales = await Order.aggregate([
//             { 
//                 $match: { status: { $nin: ["Cancelled", "Returned"] } } 
//             },
//             { $unwind: "$orderedItems" }, 
//             {
//                 $group: {
//                     _id: null,
//                     totalAmount: { $sum: "$finalAmount" }, 
//                     totalOrder: { $sum: 1 },  
//                     totalDiscountPrice: { $sum: "$discount" }, 
//                     itemSold: { $sum: "$orderedItems.quantity" } 
//                 }
//             }
//         ]);
            
      
//         //console.log('total sales',totalSales);
//         const salesData = totalSales[0] || {
//             totalAmount: 0,
//             totalOrder: 0,
//             totalDiscount: 0,
//             itemSold :0,
//        };

//       const order = await Order.find().sort({createdOn:-1}).limit(limit).skip((page-1)*limit);
//       //console.log(order,"order");

//       const count = await Order.countDocuments();
//       const totalPage = Math.ceil(count / limit);

//       const processingOrders = await Order.countDocuments({ status: 'Order Placed' });

//         const totalCouponUsers = await Order.aggregate([
//           { $match: { couponApplied: true } },
//           { $group: { _id: "$userId" } },
//           { $count: "totalUsersApplied" }
//       ]);
      
//       const couponUsersCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalUsersApplied : 0;
      
//       //console.log(couponUsersCount);
      
//       const topOrders = await Order.aggregate([
//         { $unwind: "$orderedItems" },
//         {
//           $group: {
//             _id: "$orderedItems.productId", 
//             orderCount: { $sum: 1 },
//           },
//         },
//         { $sort: { orderCount: -1 } },
//         { $limit: 5 },
//         {
//           $lookup: {
//             from: "products",
//             localField: "_id",
//             foreignField: "_id",
//             as: "productDetails",
//           },
//         },
//         { $unwind: "$productDetails" },
//         {
//           $project: {
//             _id: 0,
//             productId: "$_id",
//             name: "$productDetails.productName",
//             orderCount: 1,
//           },
//         },
//       ]);
      
//       //console.log("Top Ordered Products:", topOrders);

//       const topCategories = await Order.aggregate([
//         { $unwind: "$orderedItems" },
//         {
//           $lookup: {
//             from: "products",
//             localField: "orderedItems.productId", 
//             foreignField: "_id",
//             as: "productDetails",
//           },
//         },
//         { $unwind: "$productDetails" },
//         {
//           $group: {
//             _id: "$productDetails.category", 
//             categoryCount: { $sum: 1 },
//           },
//         },
//         { $sort: { categoryCount: -1 } },
//         { $limit: 5 },
//         {
//           $lookup: {
//             from: "categories",
//             localField: "_id",
//             foreignField: "_id",
//             as: "categoryDetails",
//           },
//         },
//         { $unwind: "$categoryDetails" },
//         {
//           $project: {
//             _id: 0,
//             categoryId: "$_id",
//             categoryName: "$categoryDetails.name",
//             categoryCount: 1,
//           },
//         },
//       ]);

//       if (req.xhr) {
//         return res.json({ orders:salesData, totalPage, currentPage: page });
//       }
      
//       //console.log("Top Categories:", topCategories);
      
//       res.render('dashboard', {
//             userCount,
//             orders: salesData,
//             processingOrders,
//             totalCouponUsers: couponUsersCount,
//             totalPage,
//             currentPage: page,
//             limit,
//             order:order,
//             products:topOrders,
//             category:topCategories,
            
//       })
//     } catch (error) {
//           res.redirect('/pageerror');
//     }
//   }
// }

const loadDashboard = async (req, res) => {
  if (req.session.admin) {
      try {
          let page = parseInt(req.query.page) || 1;
          let limit = 10;
          let skip = (page - 1) * limit;

          const startDate = req.query.startDatee ? new Date(req.query.startDatee) : null;
          const endDate = req.query.endDatee ? new Date(req.query.endDatee) : null;
          // console.log("1",startDate);
          // console.log("2",endDate)

          let query = {};
          if (startDate && endDate) {
              query.createdOn = { $gte: startDate, $lte: endDate };
          }

          const userCount = await User.countDocuments({ isAdmin: false });
          const totalSales = await Order.aggregate([
            { $match: { status: { $nin: ["Cancelled", "Returned"] }, ...query } },
            { $unwind: "$orderedItems" },
            { $match: { "orderedItems.orderStatus": { $ne: "Returned" } } },  
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$finalAmount" },
                totalOrder: { $sum: 1 },
                totalDiscountPrice: { $sum: "$discount" },
                itemSold: { $sum: "$orderedItems.quantity" }  
              }
            }
          ]);

          //console.log("Sales",totalSales);

          const salesData = totalSales[0] || {
              totalAmount: 0,
              totalOrder: 0,
              totalDiscountPrice: 0,
              itemSold: 0,
          };

          const order = await Order.find(query).sort({ createdOn: -1 }).limit(limit).skip(skip);
          const count = await Order.countDocuments(query);
          const totalPage = Math.ceil(count / limit);

          const processingOrders = await Order.countDocuments({ status: 'Order Placed', ...query });

          const totalCouponUsers = await Order.aggregate([
            { $match: { couponApplied: true } },
            { $count: "totalCouponApplied" }
        ]);

        //console.log("Coupon", totalCouponUsers)


        const totalCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalCouponApplied : 0;
        console.log("Total Coupons Applied:", totalCount);

          const topOrders = await Order.aggregate([
              { $unwind: "$orderedItems" },
              { $match: query },
              {
                  $group: {
                      _id: "$orderedItems.productId",
                      orderCount: { $sum: 1 },
                  },
              },
              { $sort: { orderCount: -1 } },
              { $limit: 5 },
              {
                  $lookup: {
                      from: "products",
                      localField: "_id",
                      foreignField: "_id",
                      as: "productDetails",
                  },
              },
              { $unwind: "$productDetails" },
              {
                  $project: {
                      _id: 0,
                      productId: "$_id",
                      name: "$productDetails.productName",
                      orderCount: 1,
                  },
              },
          ]);

          const topCategories = await Order.aggregate([
              { $unwind: "$orderedItems" },
              { $match: query },
              {
                  $lookup: {
                      from: "products",
                      localField: "orderedItems.productId",
                      foreignField: "_id",
                      as: "productDetails",
                  },
              },
              { $unwind: "$productDetails" },
              {
                  $group: {
                      _id: "$productDetails.category",
                      categoryCount: { $sum: 1 },
                  },
              },
              { $sort: { categoryCount: -1 } },
              { $limit: 5 },
              {
                  $lookup: {
                      from: "categories",
                      localField: "_id",
                      foreignField: "_id",
                      as: "categoryDetails",
                  },
              },
              { $unwind: "$categoryDetails" },
              {
                  $project: {
                      _id: 0,
                      categoryId: "$_id",
                      categoryName: "$categoryDetails.name",
                      categoryCount: 1,
                  },
              },
          ]);

          if (req.xhr) {
              return res.json({ orders: salesData, totalPage, currentPage: page });
          }

          res.render('dashboard', {
              userCount,
              orders: salesData,
              processingOrders,
              totalCouponUsers: totalCount,
              totalPage,
              currentPage: page,
              limit,
              order: order,
              products: topOrders,
              category: topCategories,
              startDate: req.query.startDatee || '',
              endDate: req.query.endDatee || ''
          });
      } catch (error) {
          res.redirect('/pageerror');
      }
  }
};


const salesReport = async (req, res) => {
  try {
    const {startDatee, endDatee } = req.query;
    //console.log('start date and end date is here',startDatee,endDatee)

    if (!startDatee && endDatee ) {
      return res.status(400).json({ error: "Date is required" });
    }

    const startDate = new Date(startDatee);
    const endDate = new Date(endDatee);
    endDate.setHours(23, 59, 59, 999);

    //console.log("Start Date:", startDate.toISOString());
    //console.log("End Date:", endDate.toISOString());

    
    const userCount = await User.countDocuments();
    //console.log("User Count:", userCount);


    const processingOrders = await Order.countDocuments({
      status: "Order Placed",
      createdOn: { $gte: startDate, $lte: endDate }
    });

    //console.log("Pending Order Count:", processingOrders);

    const order = await Order.find({createdOn: { $gte: startDate, $lte: endDate }}).sort({finalAmount:-1}).limit(10)
    const salesData = await Order.aggregate([
      { $match: { createdOn: { $gte: startDate, $lte: endDate } } },
      { $unwind: "$orderedItems" },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$finalAmount" },
          totalOrder: { $sum: 1 },
          totalCouponDiscount: { $sum:'$couponDiscount'},
          totalDiscountPrice: { $sum: "$discount" },
          itemSold: { $sum: "$orderedItems.quantity" } 
        },
      },
    ]);

    //console.log("Sales Data:", salesData);
    const totalCouponUsers = await Order.aggregate([
      { $match: { couponApplied: true } },
      { $group: { _id: "$userId" } },
      { $count: "totalUsersApplied" }
  ]);
  
  const couponUsersCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalUsersApplied : 0;

   
    const salesReportData = salesData.length
      ? salesData[0]
      : {
          totalAmount: 0,
          totalOrder: 0,
          totalCouponDiscount: 0,
          totalDiscountPrice: 0,
          itemSold: 0,
        };

    const report = {
      ...salesReportData,
      userCount,
      processingOrders,
      order,
      totalCouponUsers: couponUsersCount,
    };

    res.json(report);

    //console.log("Sales Report:", report);

  } catch (error) {
    console.error("Sales report error:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
};


const downloadExcelReport = async (req, res) => {
  try {
    const { startDate, endDate, salesData } = req.body;

    if (!startDate || !endDate || !salesData) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    // Define total columns
    const totalColumns = 10;

    // Merge header across all columns
    worksheet.mergeCells("A1:J1");
    const headerCell = worksheet.getCell("A1");
    headerCell.value = `Sales Report from ${startDate} to ${endDate}`;
    headerCell.font = { bold: true, size: 20, color: { argb: "FFFFFF" } };
    headerCell.alignment = { horizontal: "center", vertical: "middle" };
    headerCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "4F81BD" }, // Blue background
    };

    // Set row height for visibility
    worksheet.getRow(1).height = 30;

    // Add an empty row to avoid conflicts
    worksheet.addRow([]);

    // === ORDER DETAILS SECTION ===
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

    // Style the order details header
    orderDetailsHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFC000" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    // Set column widths
    worksheet.columns = [
      { key: 'orderId', width: 15 },
      { key: 'userId', width: 15 },
      { key: 'totalPrice', width: 15 },
      { key: 'gstAmount', width: 15 },
      { key: 'discount', width: 15 },
      { key: 'shipping', width: 15 },
      { key: 'finalAmount', width: 15 },
      { key: 'status', width: 15 },
      { key: 'paymentMethod', width: 15 },
      { key: 'invoiceDate', width: 20 },
    ];

    // Add order data
    salesData.order.forEach((order) => {
      const row = worksheet.addRow([
        order.orderId,
        order.userId,
        order.totalPrice,
        order.gstAmount,
        order.discount,
        order.shipping,
        order.finalAmount,
        order.status,
        order.paymentMethod,
        order.invoiceDate,
      ]);

      // Format the date in the last column
      const dateCell = row.getCell(10);
      dateCell.numFmt = 'mm/dd/yyyy'; // Change this to your desired date format
    });

    // Add space before Summary section
    worksheet.addRow([]);

    // === SUMMARY SECTION ===
    worksheet.addRow(["Summary"]).font = { bold: true, size: 14 };

    const summaryHeaderRow = worksheet.addRow([
      "Total Amount",
      "Total Orders",
      "Total Coupon Discount",
      "Total Discount Price",
      "Items Sold",
    ]);

    // Style the summary headers
    summaryHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "70AD47" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    // Add summary data
    worksheet.addRow([
      salesData.totalAmount,
      salesData.totalOrder,
      salesData.totalCouponDiscount,
      salesData.totalDiscountPrice,
      salesData.itemSold,
    ]);

    const reportsDir = "D:\\BROTOTYPE\\TICKSCAPE\\public\\sales_reports";

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filePath = path.join(
      reportsDir,
      `TickScape-sales-report-${startDate}-${endDate}.xlsx`
    );

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, `TickScape-sales-report-${startDate}-${endDate}.xlsx`);
  } catch (error) {
    console.error("Error generating Excel report:", error);
    res.status(500).json({ error: "Failed to generate Excel report" });
  }
};


const downloadPDFReport = async (req, res) => {
  try {
    const { startDate, endDate, salesData } = req.body;

    if (!startDate || !endDate || !salesData) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const reportsDir = "D:\\BROTOTYPE\\TICKSCAPE\\public\\sales_reports";

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filePath = path.join(reportsDir, `TickScape-sales-report-${startDate}-${endDate}.pdf`);

    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    doc.fontSize(20).text(`Sales Report from ${startDate} to ${endDate}`, { align: "center" }).moveDown();

    doc.fontSize(14).text("Order Details", { align: "center" }).moveDown();

    const table = {
      headers: [
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
      ],
      rows: salesData.order.map((order) => [
        order.orderId,
        order.userId,
        order.totalPrice,
        order.gstAmount,
        order.discount,
        order.shipping,
        order.finalAmount,
        order.status,
        order.paymentMethod,
        order.invoiceDate,
      ]),
    };

    await doc.table(table, {
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
      prepareRow: (row, indexColumn, indexRow, rectRow) => doc.font("Helvetica").fontSize(8),
      width: 500,
    });

    doc.moveDown().fontSize(14).text("Summary", { align: "center" }).moveDown();
    doc.fontSize(12);
    doc.text(`Total Amount: ${salesData.totalAmount}`);
    doc.text(`Total Orders: ${salesData.totalOrder}`);
    doc.text(`Total Coupon Discount: ${salesData.totalCouponDiscount}`);
    doc.text(`Total Discount Price: ${salesData.totalDiscountPrice}`);
    doc.text(`Items Sold: ${salesData.itemSold}`);   

    doc.end();

    writeStream.on("finish", () => {
      res.download(filePath, `TickScape-sales-report-${startDate}-${endDate}.pdf`, (err) => {
        if (err) {
          console.error("Error sending file:", err);
          res.status(500).json({ error: "Failed to download PDF report" });
        }
      });
    });

    writeStream.on("error", (err) => {
      console.error("Error writing PDF file:", err);
      res.status(500).json({ error: "Failed to generate PDF report" });
    });

  } catch (error) {
    console.error("Error generating PDF report:", error);
    res.status(500).json({ error: "Failed to generate PDF report" });
  }
};

module.exports = {
    loadDashboard,
    salesReport,
    downloadExcelReport,
    downloadPDFReport,
}

