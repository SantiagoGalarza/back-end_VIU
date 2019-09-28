import express from 'express'
import { textCredibility, whatever } from './service'

const calculatorRoutes = express.Router()

calculatorRoutes.get('/plain-text', function(req, res) {
  res.send(textCredibility(req.query.text, {
    weightBadWords: +req.query.weightBadWords,
    weightMisspelling: +req.query.weightMisspelling,
    weightSpam: +req.query.weightSpam
  }))
})

calculatorRoutes.get('/twitter/social/:userId', function(req, res, next) { 
  whatever(req.params.userId)
    .then(response => {
      res.send(response)
      next()
    })
})

export default calculatorRoutes