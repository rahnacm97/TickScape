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

          const orders = await Order.countDocuments();
          //console.log(orders);

          //console.log("Sales",itemSold);

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

        const lowStockProducts = await Product.find({ quantity: { $lte: 5 } });
        //console.log("2",lowStockProducts);

        const totalCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalCouponApplied : 0;
        //console.log("Total Coupons Applied:", totalCount);

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
              { $limit: 10 },
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
              { $limit: 10 },
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


          const topBrands = await Order.aggregate([
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
                $lookup: {
                    from: "brands", 
                    localField: "productDetails.brand",
                    foreignField: "_id",
                    as: "brandDetails",
                },
            },
            { $unwind: "$brandDetails" },
            {
                $group: {
                    _id: "$productDetails.brand",
                    brandCount: { $sum: 1 },
                    brandName: { $first: "$brandDetails.brandName" }, 
                },
            },
            { $sort: { brandCount: -1 } },
            { $limit: 10 },
            {
                $project: {
                    _id: 0,
                    brandId: "$_id",
                    brandName: 1, 
                    brandCount: 1,
                },
            },
        ]);
        
        
        //console.log(topBrands);        

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
              brand: topBrands,
              startDate: req.query.startDatee || '',
              endDate: req.query.endDatee || '',
              lowStockProducts: lowStockProducts
          });
      } catch (error) {
          res.redirect('/pageerror');
      }
  }
};


// const salesReport = async (req, res) => {
//   try {
//       let page = parseInt(req.query.page) || 1;
//       let limit = 20;
//       let skip = (page - 1) * limit;

//       const startDate = req.query.startDatee ? new Date(req.query.startDatee) : null;
//       const endDate = req.query.endDatee ? new Date(req.query.endDatee) : null;

//       if (!startDate || !endDate) {
//           return res.status(400).json({ error: "Both start and end dates are required" });
//       }

//       endDate.setHours(23, 59, 59, 999);

//       let query = {};
//       if (startDate && endDate) {
//           query.createdOn = { $gte: startDate, $lte: endDate };
//       }

//       const userCount = await User.countDocuments({ isAdmin: false });

//       const totalSales = await Order.aggregate([
//           { $match: { status: { $nin: ["Cancelled", "Returned"] }, ...query } },
//           { $unwind: "$orderedItems" },
//           { $match: { "orderedItems.orderStatus": { $ne: "Returned" } } },
//           {
//               $group: {
//                   _id: null,
//                   totalAmount: { $sum: "$finalAmount" },
//                   totalOrder: { $sum: 1 },
//                   totalDiscountPrice: { $sum: "$discount" },
//                   itemSold: { $sum: "$orderedItems.quantity" },
//                   totalCouponDiscount: { $sum: "$couponDiscount" },
//               }
//           }
//       ]);

//       const salesData = totalSales.length
//           ? totalSales[0]
//           : { totalAmount: 0, totalOrder: 0, totalDiscountPrice: 0, itemSold: 0, totalCouponDiscount: 0 };

//       const processingOrders = await Order.countDocuments({ status: "Order Placed", ...query });

//       const count = await Order.countDocuments(query);
//       const totalPage = Math.max(Math.ceil(count / limit), 1);

//       const order = await Order.find(query).sort({ createdOn: -1 }).limit(limit).skip(skip);

//       const totalCouponUsers = await Order.aggregate([
//           { $match: { couponApplied: true } },
//           { $count: "totalCouponApplied" }
//       ]);

//       const totalCouponCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalCouponApplied : 0;

//       const result = {
//           ...salesData,
//           userCount,
//           processingOrders,
//           order,
//           totalCouponUsers: totalCouponCount,
//           totalPage,
//           currentPage: page,
//           startDate: req.query.startDatee || '',
//           endDate: req.query.endDatee || ''
//       };

//       res.json(result);
//   } catch (error) {
//       console.error("Sales report error:", error);
//       res.status(500).json({ error: "Server error", details: error.message });
//   }
// };


const salesReport = async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = 20;
    let skip = (page - 1) * limit;
    const filterType = req.query.filterType || "custom";

    let startDate, endDate;

    // Set date range based on filter type
    switch (filterType) {
      case "daily":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0); // Start of today
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      case "weekly":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay()); // Start of week (Sunday)
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      case "monthly":
        startDate = new Date();
        startDate.setDate(1); // Start of month
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      case "custom":
        startDate = req.query.startDatee ? new Date(req.query.startDatee) : null;
        endDate = req.query.endDatee ? new Date(req.query.endDatee) : null;
        if (!startDate || !endDate) {
          return res.status(400).json({ error: "Both start and end dates are required for custom filter" });
        }
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        return res.status(400).json({ error: "Invalid filter type" });
    }

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
          itemSold: { $sum: "$orderedItems.quantity" },
          totalCouponDiscount: { $sum: "$couponDiscount" },
        },
      },
    ]);

    const salesData = totalSales.length
      ? totalSales[0]
      : { totalAmount: 0, totalOrder: 0, totalDiscountPrice: 0, itemSold: 0, totalCouponDiscount: 0 };

    const processingOrders = await Order.countDocuments({ status: "Order Placed", ...query });

    const count = await Order.countDocuments(query);
    const totalPage = Math.max(Math.ceil(count / limit), 1);

    const order = await Order.find(query).sort({ createdOn: -1 }).limit(limit).skip(skip);

    const totalCouponUsers = await Order.aggregate([
      { $match: { couponApplied: true, ...query } }, // Add query here to filter by date
      { $count: "totalCouponApplied" },
    ]);

    const totalCouponCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalCouponApplied : 0;

    const result = {
      ...salesData,
      userCount,
      processingOrders,
      order,
      totalCouponUsers: totalCouponCount,
      totalPage,
      currentPage: page,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      filterType,
    };

    res.json(result);
  } catch (error) {
    console.error("Sales report error:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

const downloadExcelReport = async (req, res) => {
  try {
    //console.log(req.body);
    const { startDate, endDate, salesData } = req.body;

    if (!startDate || !endDate || !salesData) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    const totalColumns = 10;

    worksheet.mergeCells("A1:J1");
    const headerCell = worksheet.getCell("A1");
    headerCell.value = `Sales Report from ${startDate} to ${endDate}`;
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
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFC000" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

  
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
      dateCell.numFmt = 'dd-mm-yyyy';  
    });

    worksheet.addRow([]);

    worksheet.addRow(["Summary"]).font = { bold: true, size: 14 };

    const summaryHeaderRow = worksheet.addRow([
      "Total Amount",
      "Total Orders",
      "Total Coupon Discount",
      "Total Discount Price",
      "Items Sold",
    ]);

    summaryHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "70AD47" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

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

    const formatDate = (isoDate) => {
      const date = new Date(isoDate);
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

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
        order.orderId || order._id,
        order.userId,
        order.totalPrice,
        order.gstAmount,
        order.discount,
        order.shipping,
        order.finalAmount,
        order.status,
        order.paymentMethod,
        formatDate(order.invoiceDate),
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

const Chart = async (req, res) => {
  try {
    let { filter } = req.query;
    //console.log('filter:', filter);

    let matchStage = {};

    // Default to "monthly" if no filter is provided
    if (!filter) filter = "monthly";

    if (filter === "yearly") {
      matchStage = { createdOn: { $gte: new Date(new Date().getFullYear(), 0, 1) } };
    } else if (filter === "monthly") {
      let startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      matchStage = { createdOn: { $gte: startOfMonth } };
    } else if (filter === "weekly") {
      let startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 7);
      matchStage = { createdOn: { $gte: startOfWeek } };
    }

    //console.log('Match stage:', matchStage);

    const salesData = await Order.aggregate([
      { $match: { status: { $nin: ["Cancelled", "Returned"] }, ...matchStage } },
      { $unwind: "$orderedItems" },
      { $match: { "orderedItems.orderStatus": { $ne: "Returned" } } },
      {
        $group: {
          _id: "$_id",
          createdOn: { $first: "$createdOn" },
          finalAmount: { $first: "$finalAmount" }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdOn" } },
          totalSales: { $sum: "$finalAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    //console.log('Sales data:', salesData);

    if (!salesData || salesData.length === 0) {
      return res.json({ labels: [], values: [], message: "No data found for the selected period" });
    }

    const labels = salesData.map((data) => data._id);
    const values = salesData.map((data) => data.totalSales);

    //console.log('labels:', labels);
    //console.log('values:', values);

    res.json({ labels, values });
  } catch (error) {
    console.error("Chart aggregation error:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
};

module.exports = {
    loadDashboard,
    salesReport,
    downloadExcelReport,
    downloadPDFReport,
    Chart,
}

