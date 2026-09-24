import { ProductSchema, AddonSchema , ProductVariantSchema , CategorySchema , SubCategorySchema , ManyProductSchema , MenuSchema } from './product.schema';
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { uploadImage, deleteImage } from '../utilities/storage.service';


// CREATE ENDPOINTS : PRODUCTS , ADDONS , VARIANTS , CATEGORIES , SUBCATEGORIES

//CREATE PRODUCT ENDPOINT

export const createProduct = async (req: Request, res: Response) => {
      let uploadedPath: string | null = null;


    const result = ProductSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid product data', details: result.error } });
    }

    const productData = result.data;

     // ── Image ────────────────────────────────────────────────────────────
    if (!req.file) {
        return res.status(400).json({ error: { message: "Image file is required" } });
    }


    // addons are optional — some reference existing addons (by id), others are created inline
    type AddonInput = z.infer<typeof AddonSchema>; // "one item from the addons array"

    let existingAddonIds: string[] = [];
    let newAddonsData: AddonInput[] = [];

    if (req.body.addons) {
        const addonsResult = z.array(AddonSchema).safeParse(req.body.addons);

        if (!addonsResult.success) {
            return res.status(400).json({ error: { message: 'Invalid addon data', details: addonsResult.error } });
        }

        existingAddonIds = addonsResult.data
            .filter((addon) => addon.id)
            .map((addon) => addon.id as string);

        newAddonsData = addonsResult.data
            .filter((addon) => !addon.id);
    }
      // Variants are optional: default([]) turns a missing field into an empty list
      const VariantResult = z.array(ProductVariantSchema).default([]).safeParse(req.body.variants);

      if (!VariantResult.success) {
          return res.status(400).json({ error: { message: 'Invalid variant data', details: VariantResult.error } });
      }

    try {
       // 1. Upload the image to Supabase
        const uploaded = await uploadImage(req.file.buffer, req.file.mimetype, "products");
        uploadedPath = uploaded.path;

        const newProduct = await prisma.products.create({
            data: {
                ...productData,
                imageUrl: uploaded.url,
                imagePath: uploaded.path,
                addons: {
                    connect: existingAddonIds.map((id) => ({ id })),
                    create: newAddonsData,
                },
                variants: {
                    create: VariantResult.data,
                },
            },
            include: { addons: true, variants: true },
        });

        res.status(201).json({ data: newProduct, meta: null });
    } catch (error) {
         // 3. If the DB failed after the upload succeeded, delete the orphan file
        if (uploadedPath) {
            try {
                await deleteImage(uploadedPath);
            } catch (cleanupError) {
                console.error("Failed to clean up image:", uploadedPath, cleanupError);
            }
        }
        console.error("Error creating product:", error);
        res.status(500).json({ error: { message: "Failed to create product" } });
    }
};

// CREATE MULTIPLE PRODUCTS AT ONCE
export const createManyProducts = async (req: Request, res: Response) => {
    const result = ManyProductSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid product data', details: result.error } });
    }

    const productData = result.data;

    try {
        const createdProducts = await prisma.$transaction(async (tx) => {
            const created = [];

            for (const product of productData) {
                type AddonInput = z.infer<typeof AddonSchema>;

                const existingAddonIds: string[] = product.addons
                    ?.filter((addon) => addon.id)
                    .map((addon) => addon.id as string) || [];

                const newAddonsData: AddonInput[] = product.addons
                    ?.filter((addon) => !addon.id) || [];

                const createdProduct = await tx.products.create({
                    data: {
                        ...product,
                        addons: {
                            connect: existingAddonIds.map((id) => ({ id })),
                            create: newAddonsData,
                        },
                        variants: {
                            create: product.variants || [],
                        },
                    },
                    include: { addons: true, variants: true },
                });

                created.push(createdProduct);
            }

            return created;
        });

        res.status(201).json({ data: createdProducts, meta: null });
    } catch (error) {
        console.error("Error creating products:", error);
        res.status(500).json({ error: { message: "Failed to create products" } });
    }
};

// MENU SECTION : Create Menu
export const makeMenu = async (req: Request, res: Response) => {
   let uploadedPath: string | null = null;

    const result = MenuSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid menu data', details: result.error } });
    }

    const { MenuItems, ...menuData } = result.data;

    if (!req.file) {
        return res.status(400).json({ error: { message: "Image file is required" } });
    }

    try {
        const uploaded = await uploadImage(req.file.buffer , req.file.mimetype , "menus")
        uploadedPath = uploaded.path;

        const newMenu = await prisma.menu.create({
            data: {
                ...menuData,
                imageUrl: uploaded.url,
                imagePath: uploaded.path,
                items: {
                    create: MenuItems.map(({ productId, quantity }) => ({
                        quantity,
                        product: { connect: { id: productId } },
                    })),
                },
            },
            include: { items: true },
        });

        res.status(201).json({ data: newMenu, meta: null });
    } catch (error) {
        console.error("Error creating menu:", error);

           // 3. If the DB failed after the upload succeeded, delete the orphan file
        if (uploadedPath) {
            try {
                await deleteImage(uploadedPath);
            } catch (cleanupError) {
                console.error("Failed to clean up image:", uploadedPath, cleanupError);
            }
        }


        res.status(500).json({ error: { message: "Failed to create menu" } });
    }
};

// MENU SECTION : Create Many Menus at once
export const makeManyMenus = async (req: Request, res: Response) => {
    const result = z.array(MenuSchema).safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid menu data', details: result.error } });
    }

    const menuData = result.data;

    try {
        const newMenus = await prisma.$transaction(async (tx) => {
            const created = [];

            for (const menu of menuData) {
                const { MenuItems, ...rest } = menu;

                const newMenu = await tx.menu.create({
                    data: {
                        ...rest,
                        items: {
                            create: MenuItems.map(({ productId, quantity }) => ({
                                quantity,
                                product: { connect: { id: productId } },
                            })),
                        },
                    },
                    include: { items: true },
                });

                created.push(newMenu);
            }

            return created;
        });

        res.status(201).json({ data: newMenus, meta: null });
    } catch (error) {
        console.error("Error creating menus:", error);
        res.status(500).json({ error: { message: "Failed to create menus" } });
    }
};
// ADDON SECTION : Create  Addons

export const createAddon = async (req: Request, res: Response) => {
    let uploadedPath: string | null = null;
    const result = AddonSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid addon data', details: result.error } });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: { message: "Image file is required" } });
    }

    try {

        const uploaded = await uploadImage(req.file.buffer , req.file.mimetype , "addons")
        uploadedPath = uploaded.path

        const addon = result.data

        const newAddon = await prisma.addons.create({
            data: {
                imagePath : uploaded.path,
                imageUrl: uploaded.url,
                ...addon
            }
        });
        res.status(201).json({ data: newAddon, meta: null });
    }
    catch (error) {
        console.error("Error creating addon:", error);
           // 3. If the DB failed after the upload succeeded, delete the orphan file
        if (uploadedPath) {
            try {
                await deleteImage(uploadedPath);
            } catch (cleanupError) {
                console.error("Failed to clean up image:", uploadedPath, cleanupError);
            }
        }

        res.status(500).json({ error: { message: "Failed to create addon" } });
    }       
};

// CREATE MANY ADDONS AT ONCE
export const createManyAddons = async (req: Request, res: Response) => {
    const result = z.array(AddonSchema).safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid addon data', details: result.error } });
    }

    try {
        const newAddons = await prisma.addons.createMany({
            data: result.data,
        });
        res.status(201).json({ data: newAddons, meta: null });
    } catch (error) {
        console.error("Error creating addons:", error);
        res.status(500).json({ error: { message: "Failed to create addons" } });
    }
};

// Category Section :CREATE Categories

export const createCategory = async (req: Request, res: Response) => { 
    // Data validation using Zod SafeParsing
     const result = CategorySchema.safeParse(req.body);
     let uploadedPath : string | null = null;
     
     if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid product data', details: result.error } });
    }

     if (!req.file) {
        return res.status(400).json({ error: { message: "Image file is required" } });
    };

    try {
        const uploaded = await uploadImage(req.file.buffer , req.file.mimetype , "categories")
        uploadedPath = uploaded.path

        const category = result.data

        const newCategory = await prisma.category.create({
            data: {
                imagePath: uploaded.path,
                imageUrl: uploaded.url,
                ...category
            }
        });
        res.status(201).json({ data: newCategory, meta: null });
    } catch(error) {
      console.error("Error creating category:", error);
      
        // 3. If the DB failed after the upload succeeded, delete the orphan file
        if (uploadedPath) {
            try {
                await deleteImage(uploadedPath);
            } catch (cleanupError) {
                console.error("Failed to clean up image:", uploadedPath, cleanupError);
            }
        }

      res.status(500).json({error: {message: "Failed to create category"}})

    }
};

// CREATE MANY CATEGORIES AT ONCE
export const createManyCategories = async (req: Request, res: Response) => {
    const result = z.array(CategorySchema).safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid category data', details: result.error } });
    }

    try {
        const newCategories = await prisma.category.createMany({
            data: result.data,
        });
        res.status(201).json({ data: newCategories, meta: null });
    } catch (error) {
        console.error("Error creating categories:", error);
        res.status(500).json({ error: { message: "Failed to create categories" } });
    }
};


export const createSubCategory = async (req: Request, res: Response) => { 
    // Data validation using Zod SafeParsing
     const result = SubCategorySchema.safeParse(req.body);
     let uploadedPath : string | null = null;
     
     if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid subcategory data', details: result.error } });
    }

     if (!req.file) {
        return res.status(400).json({ error: { message: "Image file is required" } });
    };

    try {
        const uploaded = await uploadImage(req.file.buffer , req.file.mimetype , "subcategories")
        uploadedPath = uploaded.path

        const subcategory = result.data

        const newSubCategory = await prisma.subCategory.create({
            data: {
                imagePath: uploaded.path,
                imageUrl: uploaded.url,
                ...subcategory
            }
        });
        res.status(201).json({ data: newSubCategory, meta: null });
    } catch(error) {
     
       // 3. If the DB failed after the upload succeeded, delete the orphan file
        if (uploadedPath) {
            try {
                await deleteImage(uploadedPath);
            } catch (cleanupError) {
                console.error("Failed to clean up image:", uploadedPath, cleanupError);
            }
        }

      console.error("Error creating subcategory:", error);
      res.status(500).json({error: {message: "Failed to create subcategory"}})

    }
};

// Create Many SubCategories at once
export const createManySubCategories = async (req: Request, res: Response) => {
    const result = z.array(SubCategorySchema).safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid subcategory data', details: result.error } });
    }

    try {
        const newSubCategories = await prisma.subCategory.createMany({
            data: result.data,
        });
        res.status(201).json({ data: newSubCategories, meta: null });
    } catch (error) {
        console.error("Error creating subcategories:", error);
        res.status(500).json({ error: { message: "Failed to create subcategories" } });
    }   
};

// GET ENDPOINTS : PRODUCTS , ADDONS , VARIANTS , CATEGORIES , SUBCATEGORIES


// Function to Fetch All Products
export const getAllProducts = async (req: Request, res: Response) =>  {
      
  try {
      const products = await prisma.products.findMany({
          include: { addons: true, variants: true },
      });
      res.status(200).json({ data: products, meta: null });
  } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: { message: "Failed to fetch products" } });
  }
 
};

// Function to Fetch a Product by ID
export const getProductById = async (req: Request, res: Response) => {
    const id = req.params.id as string;

    try {
        const product = await prisma.products.findUnique({
            where: { id },
            include: { addons: true, variants: true },
        });

        if (!product) {
            return res.status(404).json({ error: { message: "Product not found" } });
        }

        res.status(200).json({ data: product, meta: null });
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ error: { message: "Failed to fetch product" } });
    }
};

// Get categories

export const getCategories = async (req: Request, res: Response) => {
    try {
        const categories = await prisma.category.findMany({
            include : {products: true , subcategories: true}
        });
        res.status(200).json({ data: categories, meta: null });
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ error: { message: "Failed to fetch categories" } });
    }
};

// Get category by Id
export const getCategoryById = async (req: Request, res: Response) => {
    const id = req.params.id as string;
   try {
        const category = await prisma.category.findUnique({
            where: {id},
            include: {products: true , subcategories : true}
        })

        if (!category) {
            return res.status(404).json({ error: { message: "Category not found" } });
        }

        res.status(200).json({data: category , meta: null})

   } catch(error){
       console.error("Error fetching category:", error);
        res.status(500).json({ error: { message: "Failed to fetch category" } });
}
};
// Get subcategories

export const getSubCategories = async (req: Request, res: Response) => {
    try {
        const subcategories = await prisma.subCategory.findMany();
        res.status(200).json({ data: subcategories, meta: null });
    } catch (error) {
        console.error("Error fetching subcategories:", error);
        res.status(500).json({ error: { message: "Failed to fetch subcategories" } });
    }
};

export const getSubCategoryById = async (req: Request , res: Response) => {
    const id = req.params.id as string
   try {
        const subcategory = await prisma.subCategory.findUnique({
            where: {id},
            include: {products : true } // I want to see if I can include addons and variants from here
        })

        if (!subcategory) {
            return res.status(404).json({ error: { message: "Subcategory not found" } });
        }

        res.status(200).json({ data: subcategory , meta: null })
    } catch (error) {
        console.error("Error fetching subcategories:", error);
        res.status(500).json({ error: { message: "Failed to fetch subcategories" } });
    }
};
// Get addons

export const getAddons = async (req: Request, res: Response) => {
    try {
        const addons = await prisma.addons.findMany();
        res.status(200).json({ data: addons, meta: null });
    }
    catch (error) {
        console.error("Error fetching addons:", error);
        res.status(500).json({ error: { message: "Failed to fetch addons" } });
    }
};

//Get addon By Id 

export const getAddonById = async (req: Request, res: Response) => {
    const id = req.params.id as string
    try {
        const addons = await prisma.addons.findUnique({
            where: {id},
        });

        if (!addons) {
            return res.status(404).json({ error: { message: "Addon not found" } });
        }

        res.status(200).json({ data: addons, meta: null });
    }
    catch (error) {
        console.error("Error fetching addons:", error);
        res.status(500).json({ error: { message: "Failed to fetch addons" } });
    }
};

// UPDATE ENDPOINTS : PRODUCTS , ADDONS , VARIANTS , CATEGORIES , SUBCATEGORIES

// Update Product by ID
export const updateProductById = async (req: Request, res: Response) => {
    let uploadedPath: string | null = null;

    const id = req.params.id as string;
    const UpdatableProductFields = ProductSchema.omit({
        categoryId: true,
        subCategoryId: true,
    }).partial();

    const result = UpdatableProductFields.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid product data', details: result.error } });
    }

    try {
        // 1. Find the existing product (we need its old image path)
        const existing = await prisma.products.findUnique({ where: { id } });

        if (!existing) {
            return res.status(404).json({ error: { message: "Product not found" } });
        }

        // 2. Upload new image only if one was sent
        let imageData = {};

        if (req.file) {
            const uploaded = await uploadImage(req.file.buffer, req.file.mimetype, "products");
            uploadedPath = uploaded.path;
            imageData = { imageUrl: uploaded.url, imagePath: uploaded.path };
        }

        // 3. Update the product
        const updatedProduct = await prisma.products.update({
            where: { id },
            data: { ...result.data, ...imageData },
            include: { addons: true, variants: true },
        });

        // 4. DB succeeded → delete the OLD image (if it was replaced)
        if (req.file && existing.imagePath) {
            try {
                await deleteImage(existing.imagePath);
            } catch (cleanupError) {
                console.error("Failed to delete old image:", existing.imagePath, cleanupError);
            }
        }

        res.status(200).json({ data: updatedProduct, meta: null });
    } catch (error) {
        console.error("Error updating product:", error);

        // 5. DB failed → delete the NEW image (the old one is still in use)
        if (uploadedPath) {
            try {
                await deleteImage(uploadedPath);
            } catch (cleanupError) {
                console.error("Failed to clean up image:", uploadedPath, cleanupError);
            }
        }

        res.status(500).json({ error: { message: "Failed to update product" } });
    }
};
// Update Category by ID
export const updateCategoryById = async (req: Request, res: Response) => {
    let uploadedPath: string | null = null;

    const id = req.params.id as string;
    const UpdatableCategoryFields = CategorySchema.partial();

    const result = UpdatableCategoryFields.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid category data', details: result.error } });
    }

    try {
        const existing = await prisma.category.findUnique({ where: { id } });

        if (!existing) {
            return res.status(404).json({ error: { message: "Category not found" } });
        }

        let imageData = {};

        if (req.file) {
            const uploaded = await uploadImage(req.file.buffer, req.file.mimetype, "categories");
            uploadedPath = uploaded.path;
            imageData = { imageUrl: uploaded.url, imagePath: uploaded.path };
        }

        const updatedCategory = await prisma.category.update({
            where: { id },
            data: { ...result.data, ...imageData },
        });

        if (req.file && existing.imagePath) {
            try {
                await deleteImage(existing.imagePath);
            } catch (cleanupError) {
                console.error("Failed to delete old image:", existing.imagePath, cleanupError);
            }
        }

        res.status(200).json({ data: updatedCategory, meta: null });
    } catch (error) {
        console.error("Error updating category:", error);

        if (uploadedPath) {
            try {
                await deleteImage(uploadedPath);
            } catch (cleanupError) {
                console.error("Failed to clean up image:", uploadedPath, cleanupError);
            }
        }

        res.status(500).json({ error: { message: "Failed to update category" } });
    }
};

// Update Subcategory by ID
export const updateSubcategoryById = async (req: Request, res: Response) => {
    let uploadedPath: string | null = null;

    const id = req.params.id as string;
    const UpdatableSubcategoryFields = SubCategorySchema.omit({ categoryId: true }).partial();

    const result = UpdatableSubcategoryFields.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid subcategory data', details: result.error } });
    }

    try {
        const existing = await prisma.subCategory.findUnique({ where: { id } });

        if (!existing) {
            return res.status(404).json({ error: { message: "Subcategory not found" } });
        }

        let imageData = {};

        if (req.file) {
            const uploaded = await uploadImage(req.file.buffer, req.file.mimetype, "subcategories");
            uploadedPath = uploaded.path;
            imageData = { imageUrl: uploaded.url, imagePath: uploaded.path };
        }

        const updatedSubcategory = await prisma.subCategory.update({
            where: { id },
            data: { ...result.data, ...imageData },
        });

        if (req.file && existing.imagePath) {
            try {
                await deleteImage(existing.imagePath);
            } catch (cleanupError) {
                console.error("Failed to delete old image:", existing.imagePath, cleanupError);
            }
        }

        res.status(200).json({ data: updatedSubcategory, meta: null });
    } catch (error) {
        console.error("Error updating subcategory:", error);

        if (uploadedPath) {
            try {
                await deleteImage(uploadedPath);
            } catch (cleanupError) {
                console.error("Failed to clean up image:", uploadedPath, cleanupError);
            }
        }

        res.status(500).json({ error: { message: "Failed to update subcategory" } });
    }
};

// Update Addons by ID
export const updateAddonsById = async (req: Request, res: Response) => {
    let uploadedPath: string | null = null;

    const id = req.params.id as string;
    const UpdatableAddonsFields = AddonSchema.omit({ id: true }).partial();

    const result = UpdatableAddonsFields.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: { message: 'Invalid addon data', details: result.error } });
    }

    try {
        const existing = await prisma.addons.findUnique({ where: { id } });

        if (!existing) {
            return res.status(404).json({ error: { message: "Addon not found" } });
        }

        let imageData = {};

        if (req.file) {
            const uploaded = await uploadImage(req.file.buffer, req.file.mimetype, "addons");
            uploadedPath = uploaded.path;
            imageData = { imageUrl: uploaded.url, imagePath: uploaded.path };
        }

        const updatedAddon = await prisma.addons.update({
            where: { id },
            data: { ...result.data, ...imageData },
        });

        if (req.file && existing.imagePath) {
            try {
                await deleteImage(existing.imagePath);
            } catch (cleanupError) {
                console.error("Failed to delete old image:", existing.imagePath, cleanupError);
            }
        }

        res.status(200).json({ data: updatedAddon, meta: null });
    } catch (error) {
        console.error("Error updating Addon:", error);

        if (uploadedPath) {
            try {
                await deleteImage(uploadedPath);
            } catch (cleanupError) {
                console.error("Failed to clean up image:", uploadedPath, cleanupError);
            }
        }

        res.status(500).json({ error: { message: "Failed to update Addon" } });
    }
};

