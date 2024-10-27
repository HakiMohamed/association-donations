// server.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.json()); 

const pdf = require('html-pdf');

app.get('/download-pdf/:id', async (req, res) => {
    const donation = await Donation.findById(req.params.id);
    const donationDetails = await DonationDetail.find({ donationId: req.params.id })
        .sort('-date');

        const contributionSummary = donationDetails.reduce((acc, curr) => {
            const { donorName, amount, date } = curr; // Ajoutez la date ici
            if (!acc[donorName]) {
                acc[donorName] = { total: 0, lastDate: date }; // Conservez la dernière date
            }
            acc[donorName].total += amount;
            acc[donorName].lastDate = date; // Met à jour la dernière date
            return acc;
        }, {});

        const donationDetailsFormatted = Object.entries(contributionSummary)
        .map(([donorName, { total, lastDate }]) => ({
            donorName,
            total,
            lastDate: new Date(lastDate).toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            }) // Formatez la dernière date ici
        }));

    const html = `
       <!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تفاصيل التبرع</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f7f7f7;
            margin: 0;
            padding: 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 20px;
        }

        h1, h2 {
            text-align: center;
            color: #333;
        }

        h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }

        h2 {
            font-size: 2em;
            margin: 20px 0 10px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }

        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }

        th {
            background-color: #f2f2f2;
            color: #333;
        }

        tr:nth-child(even) {
            background-color: #f9f9f9;
        }

        tr:hover {
            background-color: #f1f1f1;
        }

        .total {
            font-size: 1.5em;
            font-weight: bold;
            color: #2c3e50;
            text-align: right;
            margin-top: 20px;
        }

        .btn {
            display: block;
            width: 100%;
            padding: 10px;
            background-color: #007bff;
            color: white;
            text-align: center;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            margin-top: 20px;
        }

        .btn:hover {
            background-color: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>تفاصيل التبرع: ${donation.name}</h1>
        <h2>المساهمات:</h2>
        
        <table>
            <thead>
                <tr>
                    <th>اسم المساهم</th>
                    <th>المبلغ (درهم)</th>
                    <th>التاريخ</th>
                </tr>
            </thead>
            <tbody>
                ${donationDetailsFormatted.map((detail, index) => `
                    <tr>
                        <td>${detail.donorName}</td>
                        <td>${detail.total}</td>
                        <td>${detail.lastDate}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <p class="total">المجموع: ${donation.totalAmount} درهم</p>
        
    </div>
</body>
</html>

    `;

    const options = { format: 'A4' };

    pdf.create(html, options).toFile(`./${donation.name}-donation-details.pdf`, (err, result) => {
        if (err) return res.send(Promise.reject(err));
        res.download(result.filename); // Downloads the PDF
    });
});



mongoose.connect('mongodb+srv://mohamedhaki70:RwP2ge94ejyBDxIt@cluster0.9cjsc.mongodb.net/donationsDB', {});

// Modèle de données amélioré
const DonationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true }, // Code de sécurité pour la suppression
    createdBy: String,
    startDate: { type: Date, default: Date.now },
    totalAmount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
});

const DonationDetailSchema = new mongoose.Schema({
    donorName: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    donationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation' }
});

const Donation = mongoose.model('Donation', DonationSchema);
const DonationDetail = mongoose.model('DonationDetail', DonationDetailSchema);

// Fonction pour générer un code aléatoire
function generateDonationCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Routes
app.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1; // Page actuelle, par défaut 1
    const limit = 5; // Nombre d'éléments par page
    const skip = (page - 1) * limit;

    // Récupérer le nombre total de dons
    const totalDonations = await Donation.countDocuments({ isActive: true });

    // Calculer le nombre total de pages
    const totalPages = Math.ceil(totalDonations / limit);

    // Récupérer les dons pour la page actuelle avec limite et décalage
    const donations = await Donation.find({ isActive: true })
        .select('name startDate totalAmount')
        .skip(skip)
        .limit(limit)
        .sort('-startDate');

    res.render('index', { donations, page, totalPages });
});


app.post('/add-donation', async (req, res) => {
    const { name } = req.body;
    const code = generateDonationCode();
    const donation = new Donation({
        name,
        code,
        createdBy: "currentUserId",
        totalAmount: 0
    });
    await donation.save();
    
    // Retourner le code dans une popup ou une alerte
    res.render('donation-created', { donation, code });
});

app.get('/donations/:id', async (req, res) => {
    const donation = await Donation.findById(req.params.id);
    const limit = 5; // Nombre de contributions par page
    const page = parseInt(req.query.page) || 1; // Numéro de la page actuelle

    const donationDetails = await DonationDetail.find({ donationId: req.params.id })
        .sort('-date')
        .skip((page - 1) * limit) // Ignorer les contributions des pages précédentes
        .limit(limit); // Limiter le nombre de contributions

    const totalDonationDetails = await DonationDetail.countDocuments({ donationId: req.params.id });

    // Résumé des contributions avec la dernière date
    const contributionSummary = donationDetails.reduce((acc, curr) => {
        const { donorName, amount, date } = curr; // Ajoutez la date ici
        if (!acc[donorName]) {
            acc[donorName] = { total: 0, lastDate: date }; // Conservez la dernière date
        }
        acc[donorName].total += amount;
        acc[donorName].lastDate = date; // Met à jour la dernière date
        return acc;
    }, {});

    // Formatage des détails de la donation
    const donationDetailsFormatted = Object.entries(contributionSummary)
        .map(([donorName, { total, lastDate }]) => ({
            donorName,
            total,
            lastDate: new Date(lastDate).toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            }) // Formatez la dernière date ici
        }));

    res.render('donation-details', {
        donation,
        donationDetails: donationDetailsFormatted,
        totalAmount: donation.totalAmount,
        currentPage: page,
        totalPages: Math.ceil(totalDonationDetails / limit), // Calculer le nombre total de pages
    });
});



app.post('/add-contribution', async (req, res) => {
    const { donorName, amount, donationId } = req.body;
    const numericAmount = parseFloat(amount);

    const contribution = new DonationDetail({
        donorName,
        amount: numericAmount,
        donationId
    });
    await contribution.save();

    // Mettre à jour le montant total de la donation
    await Donation.findByIdAndUpdate(donationId, {
        $inc: { totalAmount: numericAmount }
    });

    res.redirect(`/donations/${donationId}`);
});

app.post('/delete-donation', async (req, res) => {
    try {
        const data = req.body;
        const donationId = data.donationId;
        const code = data.code;
        console.log('Tentative de suppression:', { donationId, code }); 

        const donation = await Donation.findById(donationId);
        
        if (!donation) {
            return res.status(404).json({
                success: false,
                message: 'التبرع غير موجود'
            });
        }

        // Comparaison stricte du code
        if (donation.code.trim().toUpperCase() !== code.trim().toUpperCase()) {
            console.log('Code incorrect:', {
                fourni: code.trim().toUpperCase(),
                attendu: donation.code.trim().toUpperCase()
            });
            return res.status(403).json({
                success: false,
                message: 'رمز خاطئ'
            });
        }

        // Soft delete
        await Donation.findByIdAndUpdate(donationId, { isActive: false });
        
        res.json({
            success: true,
            message: 'تم حذف التبرع بنجاح'
        });
    } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء حذف التبرع'
        });
    }
});
const PORT = 3001||3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});