const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const CustomError = require("../../utils/customError");

//Load category list
const categoryInfo = async (req, res) => {
  if (!req.session.admin) {
    res.redirect("/admin/login");
  }
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search || "";
    const searchFilter = searchQuery
      ? { name: { $regex: searchQuery, $options: "i" } }
      : {};
    const categoryData = await Category.find(searchFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments(searchFilter);
    const totalPages = Math.ceil(totalCategories / limit);
    res.render("category", {
      cat: categoryData,
      currentPage: page,
      limit: limit,
      totalPages: totalPages,
      totalCategories: totalCategories,
      searchQuery: searchQuery,
    });
  } catch (error) {
    console.error(error);
    // res.redirect('/pageerror');
    next(
      error instanceof CustomError
        ? error
        : new CustomError(500, "Failed to load categories")
    );
  }
};

//Add category page
const getAddCategory = async (req, res) => {
  if (!req.session.admin) {
    res.redirect("/admin/login");
  }
  try {
    res.render("add-category");
  } catch (error) {
    //res.redirect('/pageerror');
    next(
      error instanceof CustomError
        ? error
        : new CustomError(500, "Failed to load add category page")
    );
  }
};

//Category adding
const addCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      throw new CustomError(400, "Name and description are required");
    }

    const trimmedName = name.trim().toUpperCase();

    const existingCategory = await Category.findOne({ name: trimmedName });

    if (existingCategory) {
      next(new CustomError(400, "Category already exists"));
    }

    const newCategory = new Category({
      name: trimmedName,
      description: description.trim(),
    });

    await newCategory.save();

    return res.json({ message: "Category added successfully" });
  } catch (err) {
    //next(new CustomError(err.statusCode, err.message))
    next(
      err instanceof CustomError
        ? err
        : new CustomError(500, "Failed to add category")
    );
  }
};

//Adding category offer
const addCategoryOffer = async (req, res, next) => {
  try {
    const percentage = parseInt(req.body.percentage);
    const categoryId = req.body.categoryId;

    if (percentage < 0 || percentage > 100) {
      throw new CustomError(400, "Percentage must be between 0 and 100");
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      throw new CustomError(404, "Category not found");
    }

    await Category.updateOne(
      { _id: categoryId },
      { $set: { categoryOffer: percentage } }
    );

    const products = await Product.find({ category: category._id });

    for (const product of products) {
      const categoryDiscount = (product.regularPrice * percentage) / 100;
      const effectiveDiscount = Math.max(
        categoryDiscount,
        product.productOffer || 0
      );
      product.salePrice = product.regularPrice - effectiveDiscount;
      await product.save();
    }

    res.json({ status: true, message: "Category offer applied successfully." });
  } catch (error) {
    next(
      error instanceof CustomError
        ? error
        : new CustomError(500, "Failed to apply category offer")
    );
  }
};

//Removing category offer
const removeCategoryOffer = async (req, res, next) => {
  try {
    const { categoryId } = req.body;

    if (!categoryId) {
      // return res.status(400).json({ status: false, message: "Category ID is required." });
      throw new CustomError(400, "Category ID is required");
    }

    const category = await Category.findById(categoryId);

    if (!category) {
      //return res.status(404).json({ status: false, message: "Category not found." });
      throw new CustomError(404, "Category not found");
    }

    if (category.categoryOffer === 0) {
      //return res.json({ status: false, message: "No active offer to remove." });
      throw new CustomError(400, "No active offer to remove");
    }

    const offerAmount = category.categoryOffer;

    const products = await Product.find({ category: category._id });

    if (products.length > 0) {
      for (const product of products) {
        if (product.productOffer > 0) {
          product.salePrice += product.productOffer;
          product.productOffer = 0;
          await product.save();
        }
      }
    }

    category.categoryOffer = 0;
    await category.save();

    res.json({ status: true, message: "Category offer removed successfully." });
  } catch (error) {
    console.error("Error removing category offer:", error);
    //res.status(500).json({ status: false, message: "Internal Server Error" });
    next(
      error instanceof CustomError
        ? error
        : new CustomError(500, "Failed to remove category offer")
    );
  }
};

//Listing category
const getListCategory = async (req, res, next) => {
  try {
    let id = req.query.id;
    if (!id) {
      throw new CustomError(400, "Category ID is required");
    }
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect("/admin/category");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//Unlisting category
const getUnlistCategory = async (req, res, next) => {
  try {
    let id = req.query.id;
    if (!id) {
      throw new CustomError(400, "Category ID is required");
    }
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect("/admin/category");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//Edit category page
const getEditCategory = async (req, res, next) => {
  if (!req.session.admin) {
    res.redirect("/admin/login");
  }
  try {
    const id = req.query.id;
    const category = await Category.findOne({ _id: id });
    res.render("edit-category", { category: category });
  } catch (error) {
    //res.redirect('/pageerror');
    next(
      error instanceof CustomError
        ? error
        : new CustomError(500, "Failed to load edit category page")
    );
  }
};

//Editing category
const editCategory = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { categoryName, description } = req.body;
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp("^" + categoryName + "$", "i") },
      _id: { $ne: id },
    });

    if (existingCategory && existingCategory._id.toString() !== id) {
      next(new CustomError(400, "Category exists, choose another name"));
      //return res.status(400).json({ error: "Category exists, choose another name" });
    }

    const updateCategory = await Category.findByIdAndUpdate(
      id,
      { name: categoryName, description: description },
      { new: true }
    );

    if (updateCategory) {
      return res.json({ success: true, redirectUrl: "/admin/category" });
    } else {
      next(new CustomError(404, "Category Not Found"));
      //res.status(404).json({ error: "Category Not Found" });
    }
  } catch (error) {
    next(new CustomError(500, "Internal Server Error"));
    //res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  categoryInfo,
  getAddCategory,
  addCategory,
  addCategoryOffer,
  removeCategoryOffer,
  getListCategory,
  getUnlistCategory,
  getEditCategory,
  editCategory,
};
