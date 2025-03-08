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

const salesReport = async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = 20;
    let skip = (page - 1) * limit;
    const filterType = req.query.filterType || "custom";

    let startDate, endDate;

    // Setting date range 
    switch (filterType) {
      case "daily":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0); 
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999); 
        break;
      case "weekly":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay()); 
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999); 
        break;
      case "monthly":
        startDate = new Date();
        startDate.setDate(1); 
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999); 
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
      { $match: { couponApplied: true, ...query } }, 
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

// const Chart = async (req, res) => {
//   try {
//     let { filter, startDate, endDate } = req.query;

//     if (!filter) filter = "monthly";

//     let matchStage = {};

//     switch (filter) {
//       case "yearly":
//         matchStage = { createdOn: { $gte: new Date(new Date().getFullYear(), 0, 1) } };
//         break;
//       case "monthly":
//         matchStage = {
//           createdOn: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
//         };
//         break;
//       case "weekly":
//         let startOfWeek = new Date();
//         startOfWeek.setDate(startOfWeek.getDate() - 7);
//         matchStage = { createdOn: { $gte: startOfWeek } };
//         break;
//       case "daily":
//         let startOfDay = new Date();
//         startOfDay.setHours(0, 0, 0, 0);
//         matchStage = { createdOn: { $gte: startOfDay, $lte: new Date() } };
//         break;
//       case "custom":
//         if (!startDate || !endDate) {
//           return res.status(400).json({ error: "Start and end dates are required for custom filter" });
//         }
//         matchStage = {
//           createdOn: {
//             $gte: new Date(startDate),
//             $lte: new Date(endDate).setHours(23, 59, 59, 999)
//           }
//         };
//         break;
//       default:
//         return res.status(400).json({ error: "Invalid filter type" });
//     }

//     console.log('Match stage:', matchStage);

//     const salesData = await Order.aggregate([
//       { $match: { status: { $nin: ["Cancelled", "Returned"] }, ...matchStage } },
//       { $unwind: "$orderedItems" },
//       { $match: { "orderedItems.orderStatus": { $ne: "Returned" } } },
//       {
//         $group: {
//           _id: "$_id",
//           createdOn: { $first: "$createdOn" },
//           finalAmount: { $first: "$finalAmount" }
//         }
//       },
//       {
//         $group: {
//           _id: {
//             $dateToString: {
//               format: filter === "yearly" ? "%Y" : filter === "monthly" ? "%Y-%m" : "%Y-%m-%d",
//               date: "$createdOn"
//             }
//           },
//           totalSales: { $sum: "$finalAmount" }
//         }
//       },
//       { $sort: { _id: 1 } }
//     ]);

//     console.log('Sales data:', salesData);

//     if (!salesData || salesData.length === 0) {
//       return res.json({ labels: [], values: [], message: "No data found for the selected period" });
//     }

//     const labels = salesData.map((data) => data._id);
//     const values = salesData.map((data) => data.totalSales);

//     console.log('Labels:', labels);
//     console.log('Values:', values);

//     res.json({ labels, values });
//   } catch (error) {
//     console.error("Chart aggregation error:", error);
//     res.status(500).json({ error: "Internal Server Error", message: error.message });
//   }
// };

const Chart = async (req, res) => {
  try {
    let { filter, startDate, endDate } = req.query;

    if (!filter) filter = "monthly";

    let matchStage = {};

    switch (filter) {
      case "yearly":
        const currentYear = new Date().getFullYear();
        matchStage = {
          createdOn: {
            $gte: new Date(currentYear, 0, 1),
            $lte: new Date(currentYear, 11, 31, 23, 59, 59, 999)
          }
        };
        break;
      case "monthly":
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        matchStage = { createdOn: { $gte: startOfMonth, $lte: endOfMonth } };
        break;
      case "weekly":
        let startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        matchStage = { createdOn: { $gte: startOfWeek } };
        break;
      case "daily":
        let startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        matchStage = { createdOn: { $gte: startOfDay, $lte: new Date() } };
        break;
      case "custom":
        if (!startDate || !endDate) {
          return res.status(400).json({ error: "Start and end dates are required for custom filter" });
        }
        matchStage = {
          createdOn: {
            $gte: new Date(startDate),
            $lte: new Date(endDate).setHours(23, 59, 59, 999)
          }
        };
        break;
      default:
        return res.status(400).json({ error: "Invalid filter type" });
    }

    console.log('Match stage:', matchStage);

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
          _id: {
            $dateToString: {
              format: filter === "yearly" ? "%Y-%m" : "%Y-%m-%d", // Use daily format for all except yearly
              date: "$createdOn"
            }
          },
          totalSales: { $sum: "$finalAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    console.log('Sales data:', salesData);

    let labels, values;

    if (filter === "yearly") {
      const currentYear = new Date().getFullYear();
      const allMonths = Array.from(
        { length: 12 },
        (_, i) => `${currentYear}-${String(i + 1).padStart(2, '0')}`
      );
      const salesMap = new Map(salesData.map(item => [item._id, item.totalSales]));
      labels = allMonths;
      values = allMonths.map(month => salesMap.get(month) || 0);
    } else if (filter === "monthly") {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const startOfMonth = new Date(year, now.getMonth(), 1);

      // Define 4 week ranges (7 days each, last week covers remaining days)
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
      if (!salesData || salesData.length === 0) {
        return res.json({ labels: [], values: [], message: "No data found for the selected period" });
      }
      labels = salesData.map((data) => data._id);
      values = salesData.map((data) => data.totalSales);
    }

    console.log('Labels:', labels);
    console.log('Values:', values);

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

