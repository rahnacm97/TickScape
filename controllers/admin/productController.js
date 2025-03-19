const mongoose = require("mongoose");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Brand = require("../../models/brandSchema");
const CustomError = require("../../utils/customError");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

//Product page
const getProductAddPage = async (req, res, next) => {
  try {
    const category = await Category.find({ isListed: true });
    const brand = await Brand.find({ isBlocked: false });
    res.render("product-add", {
      cat: category,
      brand: brand,
    });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//Product add page
const addProducts = async (req, res, next) => {
  try {
    const products = req.body;

    const productExists = await Product.findOne({
      productName: products.productName,
    });
    if (!productExists) {
      const images = [];

      const processedDir = path.join(
        "public",
        "uploads",
        "product-images",
        "processed"
      );
      if (!fs.existsSync(processedDir)) {
        fs.mkdirSync(processedDir, { recursive: true });
      }

      if (req.files && req.files.length > 0) {
        for (let i = 0; i < req.files.length; i++) {
          const originalImagePath = req.files[i].path;
          const resizedImagePath = path.join(
            "public",
            "uploads",
            "product-images",
            "processed",
            Date.now() + "-" + req.files[i].filename
          );
          await sharp(originalImagePath)
            .resize({ width: 440, height: 440 })
            .toFile(resizedImagePath);

          images.push("uploads/product-images/" + req.files[i].filename);
        }
      }

      const categoryId = await Category.findOne({ name: products.category });
      if (!categoryId) {
        console.error("Invalid category name:", products.category);
        return next(new CustomError(400, "Invalid Category Name."));
       
      }

      const brandExists = await Brand.findOne({ brandName: products.brand });
      if (!brandExists) {
        console.error("Invalid brand name:", products.brand);
        
        return next(new CustomError(400, "Invalid Brand Name."));
      }

      console.log("Brand:", products.brand);

      const newProduct = new Product({
        productName: products.productName,
        description: products.description,
        brand: brandExists._id,
        category: categoryId._id,
        regularPrice: products.regularPrice,
        salePrice: products.salePrice,
        createdOn: new Date(),
        quantity: products.quantity,
        size: products.size,
        color: products.color,
        productImage: images,
        status: "Available",
      });

      await newProduct.save();
      return res.redirect("/admin/products");
    } else {
      console.error("Product already exists:", products.productName);
      return res
        .status(400)
        .json({
          success: false,
          message: "Product already exists, please try with another name",
        });
    }
  } catch (error) {
    console.error("Error saving product:", error);
    
    return next(new CustomError(500, "Error saving product" + error.message));
  }
};

//All products loading
const getAllProducts = async (req, res, next) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;

    const searchFilter = search
      ? {
          productName: { $regex: new RegExp(search, "i") },
        }
      : {};

    const productData = await Product.find(searchFilter)
      .limit(limit)
      .skip((page - 1) * limit)
      .populate("category")
      .populate("brand")
      .exec();

    const count = await Product.countDocuments(searchFilter);

    const category = await Category.find({ isListed: true });

    const brand = await Brand.find({ isBlocked: false });

    if (category && brand) {
      res.render("products", {
        data: productData,
        currentPage: page,
        limit: limit,
        totalPages: Math.ceil(count / limit),
        category: category,
        brand: brand,
        searchQuery: search,
      });
    } else {
      res.render("/pageerror");
    }
  } catch (error) {
    console.error("Error fetching products:", error);
    res.redirect("/pageerror");
  }
};

//adding product offer
const addProductOffer = async (req, res, next) => {
  try {
    const { productId, offerAmount } = req.body;


    if (!productId || !offerAmount) {
      throw new CustomError(400, "Product ID and offer amount are required");
    }

    const discountAmount = parseFloat(offerAmount);
    if (isNaN(discountAmount) || discountAmount < 0) {
      return res
        .status(400)
        .json({
          status: false,
          message: "Invalid input: offerAmount must be a positive number.",
        });
    }

    const findProduct = await Product.findOne({ _id: productId });

    if (!findProduct) {
      return res
        .status(404)
        .json({ status: false, message: "Product not found." });
    }

    if (!findProduct.regularPrice || findProduct.regularPrice <= 0) {
      throw new CustomError(
        400,
        "Product regular price must be a positive number"
      );
    }

    if (discountAmount > findProduct.regularPrice) {
      
      throw new CustomError(
        400,
        "Offer amount cannot exceed the regular price"
      );
    }

    findProduct.salePrice = findProduct.regularPrice - discountAmount;
    findProduct.productOffer = discountAmount;

    await findProduct.save();

    res.json({ status: true, message: "Offer applied successfully." });
  } catch (error) {
    console.error("Error applying product offer:", error);
   
    next(
      error instanceof CustomError
        ? error
        : new CustomError(500, "Failed to apply product offer")
    );
  }
};

//Remove product offer
const removeProductOffer = async (req, res, next) => {
  try {
    const { productId } = req.body;

    const findProduct = await Product.findOne({ _id: productId });
    if (!findProduct) {
      return res
        .status(404)
        .json({ status: false, message: "Product not found." });
    }

    const offerAmount = findProduct.productOffer;

    if (offerAmount > 0) {
      findProduct.salePrice += offerAmount;
      findProduct.productOffer = 0;
      await findProduct.save();
    }

    res.json({ status: true, message: "Offer removed successfully." });
  } catch (error) {
    console.error("Error removing product offer:", error);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//Block product
const blockProduct = async (req, res, next) => {
  try {
    let id = req.query.id.trim();
    
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });

    await User.updateMany({ wishlist: id }, { $pull: { wishlist: id } });

    await Cart.updateMany(
      { "items.productId": id },
      { $pull: { items: { productId: id } } }
    );

    
    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error blocking product:", error);
    res.redirect("/pageerror");
  }
};

//Unblock product
const unblockProduct = async (req, res, next) => {
  try {
    let id = req.query.id.trim();
    
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
    
    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error unblocking product:", error);
    res.redirect("/pageerror");
  }
};

//Edit product page
const getEditProduct = async (req, res, next) => {
  try {
    const id = req.params.id.trim();
    
    const product = await Product.findOne({ _id: id });
   
    const category = await Category.find({});
    
    const brand = await Brand.find({});
    

    res.render("edit-product", {
      product: product,
      category: category,
      brand: brand,
    });
    
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//Product editing
const editProduct = async (req, res, next) => {
  try {
    const id = req.params.id.trim();


    if (!id) {
      return next(new CustomError(400, "Invalid product ID"));
     
    }

    

    const product = await Product.findOne({ _id: id });
    if (!product) {
      return next(new CustomError(400, "Product not found"));
      
    }
    
    const data = req.body;

    const brandObj = await Brand.findById(data.brand);
    if (!brandObj) {
      return next(new CustomError(400, "Brand not found"));
      
    }
    

    const existingProduct = await Product.findOne({
      productName: data.productName,
      _id: { $ne: id },
    });

    if (existingProduct) {
      
      return next(
        new CustomError(
          400,
          "Product with this name already exists. Please try with another name."
        )
      );
    }

    const images = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) =>
        images.push(`uploads/product-images/${file.filename}`)
      );
    }
   

    let status = product.status;
    if (data.quantity && data.quantity > 0) {
      status = "Available";
    } else {
      status = "Out of Stock";
    }

    const updateFields = {
      productName: data.productName,
      description: data.description,
      brand: data.brand,
      category: data.category,
      regularPrice: data.regularPrice,
      salePrice: data.salePrice,
      quantity: data.quantity,
      size: data.size,
      color: data.color,
      status: status,
    };

    if (images.length > 0) {
      updateFields.$push = { productImage: { $each: images } };
    }
    
    await Product.findByIdAndUpdate(id, updateFields, { new: true });

    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error in editProduct:", error);
    res.redirect("/pageerror");
  }
};

//Delete single image from the images
const deleteSingleImage = async (req, res) => {
  try {

    const { imageNameToServer, productIdToServer } = req.body;
    console.log("productId:", productIdToServer);
    console.log("imageName:", imageNameToServer);

    const product = await Product.findByIdAndUpdate(productIdToServer, {
      $pull: { productImage: imageNameToServer },
    });

    const imagePath = path.join("public", imageNameToServer);
    console.log("Image path:", imagePath);

    if (fs.existsSync(imagePath)) {
      await fs.unlinkSync(imagePath);
      console.log(`Image ${imageNameToServer} deleted successfully.`);
    } else {
      console.log(`Image ${imageNameToServer} not found.`);
    }

    res.send({ status: true });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.redirect("/pageerror");
  }
};


//Product deleting
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id || !mongoose.Types.ObjectId.isValid(id.trim())) {
      return res.status(400).redirect("/pageerror");
    }
    await Product.deleteOne({ _id: id.trim() });
    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).redirect("/pageerror");
  }
};

module.exports = {
  getProductAddPage,
  addProducts,
  getAllProducts,
  addProductOffer,
  removeProductOffer,
  blockProduct,
  unblockProduct,
  getEditProduct,
  editProduct,
  deleteSingleImage,
  deleteProduct,
};
