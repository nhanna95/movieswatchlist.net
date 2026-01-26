import pandas as pd
from typing import List, Dict, Union, Optional
import logging
from io import BytesIO
from datetime import datetime

logger = logging.getLogger(__name__)

def parse_watchlist_csv(file_path: Union[str, BytesIO]) -> List[Dict[str, str]]:
    """
    Parse a Letterboxd watchlist CSV file.
    Expected columns: name (or Name), year (or Year), letterboxd_uri (or Letterboxd URI)
    """
    try:
        # Try reading with different encodings
        encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'iso-8859-1']
        df = None
        
        for encoding in encodings:
            try:
                # Reset file pointer if it's a BytesIO object
                if isinstance(file_path, BytesIO):
                    file_path.seek(0)
                df = pd.read_csv(file_path, encoding=encoding)
                logger.info(f"Successfully read CSV with encoding: {encoding}")
                break
            except UnicodeDecodeError as e:
                logger.debug(f"Failed to read with encoding {encoding}: {e}")
                continue
            except Exception as e:
                logger.warning(f"Error reading with encoding {encoding}: {e}")
                continue
        
        if df is None:
            raise ValueError("Could not read CSV file with any supported encoding")
        
        # Log original columns for debugging
        original_columns = list(df.columns)
        logger.info(f"Original columns: {original_columns}")
        logger.info(f"Original columns (repr): {[repr(col) for col in original_columns]}")
        
        # Use original column names - map to expected names
        # Expected: Date, Name, Year, Letterboxd URI
        column_map = {}
        
        # Map original column names to our expected names
        for col in df.columns:
            col_str = str(col).strip()
            logger.debug(f"Processing column: {repr(col_str)}")
            if col_str.lower() in ['name', 'title', 'movie', 'film']:
                column_map[col] = 'name'
                logger.debug(f"  -> Mapped to 'name'")
            elif col_str.lower() in ['year', 'release_year']:
                column_map[col] = 'year'
                logger.debug(f"  -> Mapped to 'year'")
            elif 'letterboxd' in col_str.lower() and ('uri' in col_str.lower() or 'url' in col_str.lower() or 'link' in col_str.lower()):
                column_map[col] = 'letterboxd_uri'
                logger.debug(f"  -> Mapped to 'letterboxd_uri' (letterboxd match)")
            elif col_str.lower() in ['uri', 'url', 'link']:
                column_map[col] = 'letterboxd_uri'
                logger.debug(f"  -> Mapped to 'letterboxd_uri' (uri/url/link match)")
            elif col_str.lower() in ['date', 'added', 'date added', 'date_added', 'watched date']:
                column_map[col] = 'date'
                logger.debug(f"  -> Mapped to 'date'")
            else:
                logger.debug(f"  -> No mapping for column: {repr(col_str)}")
        
        logger.info(f"Column mapping created: {column_map}")
        
        # Apply column mapping
        if column_map:
            df.rename(columns=column_map, inplace=True)
            logger.info(f"Applied column mapping: {column_map}")
        else:
            logger.warning("No column mapping was created!")
        
        logger.info(f"Final columns after mapping: {list(df.columns)}")
        
        # Validate required columns
        required_columns = ['name', 'year', 'letterboxd_uri']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        logger.info(f"Required columns: {required_columns}")
        logger.info(f"Missing columns: {missing_columns}")
        logger.info(f"Current df.columns: {list(df.columns)}")
        
        # Last resort: try to find columns by very lenient matching
        if missing_columns:
            logger.warning(f"Missing columns after mapping: {missing_columns}. Current columns: {list(df.columns)}")
            logger.warning(f"Attempting lenient matching...")
            lenient_map = {}
            for missing in missing_columns:
                best_match = None
                best_score = 0
                
                for col in df.columns:
                    col_lower = col.lower().replace('_', '').replace('-', '').replace(' ', '')
                    score = 0
                    
                    if missing == 'letterboxd_uri':
                        # Check for various URI-related terms
                        if 'letterboxd' in col_lower and ('uri' in col_lower or 'url' in col_lower):
                            score = 100
                        elif 'uri' in col_lower:
                            score = 50
                        elif 'url' in col_lower:
                            score = 40
                        elif 'link' in col_lower:
                            score = 30
                    elif missing == 'name':
                        if 'name' in col_lower:
                            score = 50
                        elif 'title' in col_lower:
                            score = 40
                        elif 'movie' in col_lower or 'film' in col_lower:
                            score = 30
                    elif missing == 'year':
                        if 'year' in col_lower:
                            score = 50
                        elif 'date' in col_lower and 'year' not in col_lower:
                            score = 20
                    
                    if score > best_score:
                        best_score = score
                        best_match = col
                
                if best_match and best_score > 0:
                    lenient_map[best_match] = missing
                    logger.info(f"Lenient match (score {best_score}): '{best_match}' -> '{missing}'")
            
            if lenient_map:
                df.rename(columns=lenient_map, inplace=True)
                logger.info(f"Applied lenient column mapping: {lenient_map}")
                # Re-check missing columns
                missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            # Provide helpful error message with suggestions
            found_cols = list(df.columns)
            original_cols = original_columns if 'original_columns' in locals() else found_cols
            
            error_msg = f"Missing required columns: {missing_columns}.\n"
            error_msg += f"Original columns from CSV: {original_cols}\n"
            error_msg += f"Columns after mapping: {found_cols}\n"
            error_msg += f"Column mapping that was applied: {column_map if column_map else 'None'}\n"
            
            # Try to find similar columns
            suggestions = []
            for missing in missing_columns:
                if missing == 'letterboxd_uri':
                    similar = [col for col in original_cols if any(term in str(col).lower() for term in ['uri', 'url', 'link', 'letterboxd'])]
                    if similar:
                        suggestions.append(f"Found similar columns for '{missing}': {similar}")
                elif missing == 'name':
                    similar = [col for col in original_cols if any(term in str(col).lower() for term in ['name', 'title', 'movie', 'film'])]
                    if similar:
                        suggestions.append(f"Found similar columns for '{missing}': {similar}")
                elif missing == 'year':
                    similar = [col for col in original_cols if 'year' in str(col).lower() or 'date' in str(col).lower()]
                    if similar:
                        suggestions.append(f"Found similar columns for '{missing}': {similar}")
            
            if suggestions:
                error_msg += f"Suggestions: {'; '.join(suggestions)}"
            
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Clean and validate data
        movies = []
        for idx, row in df.iterrows():
            name = str(row['name']).strip()
            year = row['year']
            uri = str(row['letterboxd_uri']).strip()
            
            # Validate year
            try:
                year = int(year)
                if year < 1888 or year > 2100:  # Reasonable year range
                    logger.warning(f"Row {idx + 1}: Invalid year {year}, skipping")
                    continue
            except (ValueError, TypeError):
                logger.warning(f"Row {idx + 1}: Invalid year '{year}', skipping")
                continue
            
            # Validate required fields
            if not name or not uri:
                logger.warning(f"Row {idx + 1}: Missing name or URI, skipping")
                continue
            
            # Parse date if present
            date_added = None
            if 'date' in df.columns and pd.notna(row.get('date')):
                try:
                    date_str = str(row['date']).strip()
                    if date_str and date_str.lower() not in ['nan', 'none', '']:
                        # Try parsing various date formats
                        date_formats = [
                            '%Y-%m-%d',           # 2024-01-15
                            '%Y/%m/%d',           # 2024/01/15
                            '%d/%m/%Y',           # 15/01/2024
                            '%m/%d/%Y',           # 01/15/2024
                            '%d-%m-%Y',           # 15-01-2024
                            '%m-%d-%Y',           # 01-15-2024
                            '%Y-%m-%d %H:%M:%S',  # 2024-01-15 12:00:00
                            '%Y-%m-%dT%H:%M:%S',  # 2024-01-15T12:00:00
                            '%Y-%m-%dT%H:%M:%SZ', # 2024-01-15T12:00:00Z
                        ]
                        
                        parsed_date = None
                        for fmt in date_formats:
                            try:
                                parsed_date = datetime.strptime(date_str, fmt)
                                break
                            except ValueError:
                                continue
                        
                        if parsed_date:
                            date_added = parsed_date
                            logger.debug(f"Row {idx + 1}: Parsed date '{date_str}' as {date_added}")
                        else:
                            # Try pandas to_datetime as fallback
                            try:
                                parsed_date = pd.to_datetime(date_str)
                                date_added = parsed_date.to_pydatetime() if hasattr(parsed_date, 'to_pydatetime') else datetime.fromisoformat(str(parsed_date))
                                logger.debug(f"Row {idx + 1}: Parsed date '{date_str}' using pandas as {date_added}")
                            except Exception:
                                logger.warning(f"Row {idx + 1}: Could not parse date '{date_str}', ignoring")
                except Exception as e:
                    logger.warning(f"Row {idx + 1}: Error parsing date: {e}, ignoring")
            
            movies.append({
                'name': name,
                'year': year,
                'letterboxd_uri': uri,
                'date_added': date_added
            })
        
        logger.info(f"Successfully parsed {len(movies)} movies from CSV")
        return movies
    
    except pd.errors.EmptyDataError:
        raise ValueError("CSV file is empty")
    except pd.errors.ParserError as e:
        raise ValueError(f"Error parsing CSV file: {str(e)}")
    except ValueError:
        # Re-raise ValueError as-is to preserve detailed error messages
        raise
    except Exception as e:
        raise ValueError(f"Unexpected error reading CSV: {str(e)}")

def parse_tracked_list_csv(file_path: Union[str, BytesIO]) -> List[Dict[str, Union[str, int]]]:
    """
    Parse a Letterboxd list export CSV file (tracked lists format).
    Expected format:
    - Header rows: "Letterboxd list export v7", "Date,Name,Tags,URL,Description", then empty line
    - Data rows: "Position,Name,Year,URL,Description"
    
    Returns list of dicts with: name, year, letterboxd_uri (extracted from URL column)
    """
    try:
        # Try reading with different encodings
        encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'iso-8859-1']
        df = None
        
        for encoding in encodings:
            try:
                # Reset file pointer if it's a BytesIO object
                if isinstance(file_path, BytesIO):
                    file_path.seek(0)
                df = pd.read_csv(file_path, encoding=encoding, skiprows=3)  # Skip header rows
                logger.info(f"Successfully read tracked list CSV with encoding: {encoding}")
                break
            except UnicodeDecodeError as e:
                logger.debug(f"Failed to read with encoding {encoding}: {e}")
                continue
            except Exception as e:
                logger.warning(f"Error reading with encoding {encoding}: {e}")
                continue
        
        if df is None:
            raise ValueError("Could not read CSV file with any supported encoding")
        
        # Log original columns for debugging
        original_columns = list(df.columns)
        logger.info(f"Original columns: {original_columns}")
        
        # Map column names to expected names
        column_map = {}
        for col in df.columns:
            col_str = str(col).strip()
            if col_str.lower() in ['name', 'title', 'movie', 'film']:
                column_map[col] = 'name'
            elif col_str.lower() in ['year', 'release_year']:
                column_map[col] = 'year'
            elif col_str.lower() in ['url', 'uri', 'link', 'letterboxd uri', 'letterboxd_uri']:
                column_map[col] = 'letterboxd_uri'
        
        # Apply column mapping
        if column_map:
            df.rename(columns=column_map, inplace=True)
            logger.info(f"Applied column mapping: {column_map}")
        
        # Validate required columns
        required_columns = ['name', 'year']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            error_msg = f"Missing required columns: {missing_columns}. Found columns: {list(df.columns)}"
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Clean and validate data
        movies = []
        for idx, row in df.iterrows():
            # Skip empty rows
            if pd.isna(row.get('name')) or str(row.get('name')).strip() == '':
                continue
            
            name = str(row['name']).strip()
            
            # Handle year - might be NaN or invalid
            year = None
            if 'year' in row and pd.notna(row['year']):
                try:
                    year = int(row['year'])
                    if year < 1888 or year > 2100:
                        logger.warning(f"Row {idx + 1}: Invalid year {year}, skipping")
                        continue
                except (ValueError, TypeError):
                    logger.warning(f"Row {idx + 1}: Invalid year '{row['year']}', skipping")
                    continue
            
            # Extract letterboxd_uri from URL column if available
            letterboxd_uri = None
            if 'letterboxd_uri' in row and pd.notna(row['letterboxd_uri']):
                letterboxd_uri = str(row['letterboxd_uri']).strip()
                if not letterboxd_uri or letterboxd_uri.lower() == 'nan':
                    letterboxd_uri = None
            
            # Validate required fields
            if not name:
                logger.warning(f"Row {idx + 1}: Missing name, skipping")
                continue
            
            movies.append({
                'name': name,
                'year': year,
                'letterboxd_uri': letterboxd_uri
            })
        
        logger.info(f"Successfully parsed {len(movies)} movies from tracked list CSV")
        return movies
    
    except pd.errors.EmptyDataError:
        raise ValueError("CSV file is empty")
    except pd.errors.ParserError as e:
        raise ValueError(f"Error parsing CSV file: {str(e)}")
    except ValueError:
        # Re-raise ValueError as-is to preserve detailed error messages
        raise
    except Exception as e:
        raise ValueError(f"Unexpected error reading CSV: {str(e)}")
