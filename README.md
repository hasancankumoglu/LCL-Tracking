# LCL-Tracking

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Database updates

Apply the SQL files in `supabase/sql` in numeric order using the Supabase SQL editor.
For existing installations, apply `011_create_booking_with_vehicles.sql` before using
**Link to New Booking** on the Unassigned Vehicles screen. This function creates the
booking and assigns all selected vehicles in one transaction; a failed assignment
leaves both the booking list and the unassigned vehicles unchanged.

Select vehicles using the row checkboxes (or Select All), then open **Link to New
Booking**. The booking form opens in a modal with Unit set to the selection count;
Unit can be increased but cannot be lower than that count. Each row's container
number and type are used during assignment. After saving, the new booking's detail
screen opens with the selected vehicles listed as containers.

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
