import express from "express";
import {
  getPages,
  getPageByDate,
  createPage,
  updatePage,
  deletePage,
  savePage,
  addTodo,
  updateTodo,
  deleteTodo,
} from "../controllers/pageController.js";

const todoRouter = express.Router();

// Page routes
todoRouter.get("/", getPages);
todoRouter.get("/date/:date", getPageByDate);
todoRouter.post("/", createPage);
todoRouter.put("/:id", updatePage);
todoRouter.delete("/:id", deletePage);
todoRouter.patch("/:id/save", savePage);

// Todo routes
todoRouter.post("/:pageId/todos", addTodo);
todoRouter.put("/:pageId/todos/:todoId", updateTodo);
todoRouter.delete("/:pageId/todos/:todoId", deleteTodo);

export default todoRouter;
