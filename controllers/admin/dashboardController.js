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
const PDFDocument = require('pdfkit-table');
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");

//Dashboard loading
const loadDashboard = async (req, res) => {
  console.log(req.session);
  if (req.session.admin) {
    try {
      let page = parseInt(req.query.page) || 1;
      let limit = 10;
      let skip = (page - 1) * limit;
      const filterType = req.query.filterType || "daily";

      let startDate, endDate;
      const now = new Date();

      switch (filterType) {
        case "daily":
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now);
          endDate.setHours(23, 59, 59, 999);
          break;
        case "weekly":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 6);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now);
          endDate.setHours(23, 59, 59, 999);
          break;
        case "monthly":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        case "yearly":
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            break;
        case "custom":
          startDate = req.query.startDatee ? new Date(req.query.startDatee) : new Date(now.setHours(0, 0, 0, 0));
          endDate = req.query.endDatee ? new Date(req.query.endDatee) : new Date(now);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          startDate = new Date(now.setHours(0, 0, 0, 0));
          endDate = new Date(now.setHours(23, 59, 59, 999));
      }

      let query = { createdOn: { $gte: startDate, $lte: endDate } };
      //console.log("loadDashboard Query:", JSON.stringify(query, null, 2));

      const userCount = await User.countDocuments({ isAdmin: false });
      const totalSales = await Order.aggregate([
        { $match: { status: { $nin: ["Cancelled", "Returned"] }, ...query } },
        { $unwind: "$orderedItems" },
        { $match: { "orderedItems.orderStatus": { $nin: ["Cancelled", "Returned"] } } }, // Exclude cancelled/returned items
        {
          $group: {
            _id: "$_id",
            activeAmount: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
            shipping: { $first: "$shipping" },
            discount: { $first: "$discount" },
            quantity: { $sum: "$orderedItems.quantity" }
          }
        },
        {
          $group: {
            _id: null,
            totalBaseAmount: { $sum: "$activeAmount" },
            totalShipping: { $sum: "$shipping" },
            totalDiscount: { $sum: "$discount" },
            totalOrder: { $sum: 1 },
            itemSold: { $sum: "$quantity" }
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
            itemSold: 1
          }
        }
      ]);

      const salesData = totalSales[0] || {
        totalAmount: 0,
        totalOrder: 0,
        totalDiscountPrice: 0,
        itemSold: 0
      };
      //console.log("loadDashboard sales:", salesData);

      const order = await Order.find(query).sort({ createdOn: -1 }).limit(limit).skip(skip);
      const count = await Order.countDocuments(query);
      const totalPage = Math.ceil(count / limit);

      const processingOrders = await Order.countDocuments({ status: "Order Placed", ...query });

      const totalCouponUsers = await Order.aggregate([
        { $match: { couponApplied: true, ...query } },
        { $count: "totalCouponApplied" }
      ]);

      const totalCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalCouponApplied : 0;

      const topOrders = await Order.aggregate([
        { $unwind: "$orderedItems" },        
        { $group: { _id: "$orderedItems.productId", orderCount: { $sum: 1 } } },
        { $sort: { orderCount: -1 } },
        { $limit: 10 },
        { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "productDetails" } },
        { $unwind: "$productDetails" },
        { $project: { _id: 0, productId: "$_id", name: "$productDetails.productName", orderCount: 1 } }
      ]);

      const topCategories = await Order.aggregate([
        { $unwind: "$orderedItems" },       
        { $lookup: { from: "products", localField: "orderedItems.productId", foreignField: "_id", as: "productDetails" } },
        { $unwind: "$productDetails" },
        { $group: { _id: "$productDetails.category", categoryCount: { $sum: 1 } } },
        { $sort: { categoryCount: -1 } },
        { $limit: 10 },
        { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "categoryDetails" } },
        { $unwind: "$categoryDetails" },
        { $project: { _id: 0, categoryId: "$_id", categoryName: "$categoryDetails.name", categoryCount: 1 } }
      ]);

      const topBrands = await Order.aggregate([
        { $unwind: "$orderedItems" },
        { $lookup: { from: "products", localField: "orderedItems.productId", foreignField: "_id", as: "productDetails" } },
        { $unwind: "$productDetails" },
        { $lookup: { from: "brands", localField: "productDetails.brand", foreignField: "_id", as: "brandDetails" } },
        { $unwind: "$brandDetails" },
        { $group: { _id: "$productDetails.brand", brandCount: { $sum: 1 }, brandName: { $first: "$brandDetails.brandName" } } },
        { $sort: { brandCount: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, brandId: "$_id", brandName: 1, brandCount: 1 } }
      ]);

      const lowStockProducts = await Product.find({ quantity: { $lte: 5 } });
      const totalProducts = await Product.countDocuments();

      if (req.xhr) {
        return res.json({ orders: salesData, totalPage, currentPage: page });
      }

      res.render('dashboard', {
        userCount,
        totalProducts,
        orders: salesData,
        processingOrders,
        totalCouponUsers: totalCount,
        totalPage,
        currentPage: page,
        limit,
        order,
        products: topOrders,
        category: topCategories,
        brand: topBrands,
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        filterType,
        lowStockProducts
      });
    } catch (error) {
      console.error("loadDashboard error:", error);
      res.redirect('/pageerror');
    }
  }
};

//Sales report
const salesReport = async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = 20;
    let skip = (page - 1) * limit;
    const filterType = req.query.filterType || "daily";

    let startDate, endDate;
    const now = new Date();

    switch (filterType) {
      case "daily":
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "weekly":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "monthly":
        startDate = new Date(now);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case "yearly":
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          break;
      case "custom":
        startDate = req.query.startDatee ? new Date(req.query.startDatee) : new Date(now.setHours(0, 0, 0, 0));
        endDate = req.query.endDatee ? new Date(req.query.endDatee) : new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        return res.status(400).json({ error: "Invalid filter type" });
    }

    let query = { createdOn: { $gte: startDate, $lte: endDate } };
    //console.log("salesReport Query:", JSON.stringify(query, null, 2));

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
          quantity: { $sum: "$orderedItems.quantity" }
        }
      },
      {
        $group: {
          _id: null,
          totalBaseAmount: { $sum: "$activeAmount" },
          totalShipping: { $sum: "$shipping" },
          totalDiscount: { $sum: "$discount" },
          totalOrder: { $sum: 1 },
          itemSold: { $sum: "$quantity" }
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
          totalCouponDiscount: "$totalDiscount"
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

    const count = await Order.countDocuments(query);
    const totalPage = Math.max(Math.ceil(count / limit), 1);

    const order = await Order.find(query).sort({ createdOn: -1 }).limit(limit).skip(skip);

    const totalProducts = await Product.countDocuments();

    const totalCouponUsers = await Order.aggregate([
      { $match: { couponApplied: true, ...query } },
      { $count: "totalCouponApplied" }
    ]);

    const totalCouponCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalCouponApplied : 0;

    const result = {
      ...salesData,
      userCount,
      processingOrders,
      order,
      totalProducts,
      totalCouponUsers: totalCouponCount,
      totalPage,
      currentPage: page,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      filterType
    };

    //console.log("salesReport Result:", JSON.stringify(result, null, 2));
    res.json(result);
  } catch (error) {
    console.error("Sales report error:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

//Details for chart
const Chart = async (req, res) => {
  try {
    let { filter, startDate, endDate } = req.query;
    if (!filter) filter = "daily";

    console.log("Filter:", filter); 
    console.log("Start Date:", startDate); 
    console.log("End Date:", endDate);

    let matchStage = {};
    const now = new Date();

    switch (filter) {
      case "yearly":
        const currentYear = now.getFullYear();
        matchStage = {
          createdOn: {
            $gte: new Date(currentYear, 0, 1),
            $lte: new Date(currentYear, 11, 31, 23, 59, 59, 999)
          }
        };
        break;
      case "monthly":
        matchStage = {
          createdOn: {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
            $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
          }
        };
        break;
        case "weekly":
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - 6);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(now);
        endOfWeek.setHours(23, 59, 59, 999);
        matchStage = {
          createdOn: {
            $gte: startOfWeek,
            $lte: endOfWeek
          }
        };
        break;
      case "daily":
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        matchStage = {
          createdOn: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        };
        break;
        case "custom":
          if (!startDate || !endDate) {
            return res.status(400).json({ error: "Start date and end date are required for custom filter" });
          }
          const start = new Date(startDate);
          const end = new Date(endDate);
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: "Invalid date format" });
          }
          end.setHours(23, 59, 59, 999); // Ensure end date includes the full day
          matchStage = {
            createdOn: {
              $gte: start,
              $lte: end
            }
          };
          break;
        default:
          return res.status(400).json({ error: "Invalid filter type" });
      }

    //console.log('Chart Match stage:', JSON.stringify(matchStage, null, 2));

    const salesData = await Order.aggregate([
      { $match: { status: { $nin: ["Cancelled", "Returned"] }, ...matchStage } },
      { $unwind: "$orderedItems" },
      { $match: { "orderedItems.orderStatus": { $nin: ["Cancelled", "Returned"] } } }, 
      {
        $group: {
          _id: {
            date: { $dateToString: { format: filter === "yearly" ? "%Y-%m" : "%Y-%m-%d", date: "$createdOn" } },
            orderId: "$_id"
          },
          activeAmount: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
          shipping: { $first: "$shipping" },
          discount: { $first: "$discount" }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          totalBaseAmount: { $sum: "$activeAmount" },
          totalShipping: { $sum: "$shipping" },
          totalDiscount: { $sum: "$discount" }
        }
      },
      {
        $project: {
          totalSales: {
            $add: [
              "$totalBaseAmount",
              { $multiply: ["$totalBaseAmount", 0.18] }, 
              "$totalShipping",
              { $multiply: ["$totalDiscount", -1] }
            ]
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    //console.log('Chart Sales data:', JSON.stringify(salesData, null, 2));

    let labels, values;
    if (filter === "yearly") {
      const currentYear = now.getFullYear();
      const allMonths = Array.from({ length: 12 }, (_, i) => `${currentYear}-${String(i + 1).padStart(2, '0')}`);
      const salesMap = new Map(salesData.map(item => [item._id, item.totalSales]));
      labels = allMonths;
      values = allMonths.map(month => salesMap.get(month) || 0);
    } else if (filter === "monthly") {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const weekRanges = [
        { start: 1, end: 7 },
        { start: 8, end: 14 },
        { start: 15, end: 21 },
        { start: 22, end: new Date(year, now.getMonth() + 1, 0).getDate() }
      ];
      labels = weekRanges.map(range => `${year}-${month}-${range.start}-${range.end}`);
      const salesMap = new Map(salesData.map(item => [item._id, item.totalSales]));
      values = weekRanges.map(range => {
        let total = 0;
        for (let day = range.start; day <= range.end; day++) {
          const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
          total += salesMap.get(dateStr) || 0;
        }
        return total;
      });
    } else {
      labels = salesData.map(data => data._id);
      values = salesData.map(data => parseFloat(data.totalSales.toFixed(2)));
    }

   console.log('Chart Labels:', labels);
    console.log('Chart Values:', values);

    res.json({ labels, values });
  } catch (error) {
    console.error("Chart aggregation error:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
};


module.exports = {
    loadDashboard,
    salesReport,
    Chart,
}

