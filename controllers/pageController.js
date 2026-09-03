import todoModel from "../models/Page.js";

// Get all pages
export const getPages = async (req, res) => {
  try {
    const pages = await todoModel.find().sort({ date: 1 });
    res.status(200).json({
      success: true,
      data: pages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching pages",
      error: error.message,
    });
  }
};

// Get page by date
export const getPageByDate = async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD",
      });
    }

    const page = await todoModel.findOne({ date });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found for this date",
      });
    }

    res.status(200).json({
      success: true,
      data: page,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching page",
      error: error.message,
    });
  }
};

// Create new page
export const createPage = async (req, res) => {
  try {
    const { date, title } = req.body;

    // Validate required fields
    if (!date || !title) {
      return res.status(400).json({
        success: false,
        message: "Date and title are required",
      });
    }

    // Check if page already exists
    const existingPage = await todoModel.findOne({ date });
    if (existingPage) {
      return res.status(409).json({
        success: false,
        message: "Page already exists for this date",
      });
    }

    const newPage = new todoModel({
      id: Date.now(),
      date,
      title,
      todos: [],
      isModified: false,
    });

    const savedPage = await newPage.save();

    res.status(201).json({
      success: true,
      data: savedPage,
      message: "Page created successfully",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Page already exists for this date",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating page",
      error: error.message,
    });
  }
};

// Update page
export const updatePage = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, todos, isModified } = req.body;

    const page = await todoModel.findOne({ id: parseInt(id) });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    // Update fields if provided
    if (title !== undefined) page.title = title;
    if (todos !== undefined) page.todos = todos;
    if (isModified !== undefined) page.isModified = isModified;

    const updatedPage = await page.save();

    res.status(200).json({
      success: true,
      data: updatedPage,
      message: "Page updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating page",
      error: error.message,
    });
  }
};

// Delete page
export const deletePage = async (req, res) => {
  try {
    const { id } = req.params;

    const page = await todoModel.findOneAndDelete({ id: parseInt(id) });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Page deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting page",
      error: error.message,
    });
  }
};

// Save page (mark as not modified)
export const savePage = async (req, res) => {
  try {
    const { id } = req.params;

    const page = await todoModel.findOneAndUpdate(
      { id: parseInt(id) },
      { isModified: false },
      { new: true }
    );

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    res.status(200).json({
      success: true,
      data: page,
      message: "Page saved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error saving page",
      error: error.message,
    });
  }
};

// Add todo to page
export const addTodo = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Todo text is required",
      });
    }

    const page = await todoModel.findOne({ id: parseInt(pageId) });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    const newTodo = {
      id: Date.now(),
      text: text.trim(),
      completed: false,
      createdAt: new Date(),
    };

    page.todos.push(newTodo);
    page.isModified = true;

    const updatedPage = await page.save();

    res.status(201).json({
      success: true,
      data: updatedPage,
      message: "Todo added successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding todo",
      error: error.message,
    });
  }
};

// Update todo
export const updateTodo = async (req, res) => {
  try {
    const { pageId, todoId } = req.params;
    const { text, completed } = req.body;

    const page = await todoModel.findOne({ id: parseInt(pageId) });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    const todo = page.todos.find((t) => t.id === parseInt(todoId));

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: "Todo not found",
      });
    }

    // Update fields if provided
    if (text !== undefined) todo.text = text.trim();
    if (completed !== undefined) todo.completed = completed;

    page.isModified = true;

    const updatedPage = await page.save();

    res.status(200).json({
      success: true,
      data: updatedPage,
      message: "Todo updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating todo",
      error: error.message,
    });
  }
};

// Delete todo
export const deleteTodo = async (req, res) => {
  try {
    const { pageId, todoId } = req.params;

    const page = await todoModel.findOne({ id: parseInt(pageId) });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    const todoIndex = page.todos.findIndex((t) => t.id === parseInt(todoId));

    if (todoIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Todo not found",
      });
    }

    page.todos.splice(todoIndex, 1);
    page.isModified = true;

    const updatedPage = await page.save();

    res.status(200).json({
      success: true,
      data: updatedPage,
      message: "Todo deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting todo",
      error: error.message,
    });
  }
};
